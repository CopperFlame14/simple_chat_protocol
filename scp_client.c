/* scp_client.c
 * Simple Chat Protocol (Client / Sender) using UDP.
 * Compile: gcc -o scp_client scp_client.c
 *
 * Usage:
 *   ./scp_client 127.0.0.1 50000
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>     // close(), read()
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <errno.h>
#include <time.h>

#define MAX_PAYLOAD 512
#define BUFSIZE 600
#define PROTO_VER 1

#define T_SYN      0x01
#define T_SYNACK   0x02
#define T_ACK      0x03
#define T_MSG      0x10
#define T_MSGACK   0x11
#define T_FIN      0x20
#define T_FINACK   0x21

#pragma pack(push,1)
typedef struct {
    uint8_t ver;
    uint8_t type;
    uint8_t flags;
    uint8_t reserved;
    uint32_t seq;
    uint16_t payload_len;
    uint16_t checksum;
    uint8_t payload[MAX_PAYLOAD];
} scp_pkt_t;
#pragma pack(pop)

static uint16_t checksum_compute(const uint8_t *buf, size_t len) {
    uint32_t s = 0;
    for (size_t i = 0; i < len; ++i) s += buf[i];
    return (uint16_t)(s & 0xFFFF);
}

int main(int argc, char **argv) {
    if (argc < 3) {
        printf("Usage: %s <server-ip> <server-port>\n", argv[0]);
        return 1;
    }
    const char *server_ip = argv[1];
    int server_port = atoi(argv[2]);

    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) { perror("socket"); return 1; }

    struct sockaddr_in servaddr;
    socklen_t servlen = sizeof(servaddr);
    memset(&servaddr,0,sizeof(servaddr));
    servaddr.sin_family = AF_INET;
    servaddr.sin_port = htons(server_port);
    if (inet_aton(server_ip, &servaddr.sin_addr) == 0) {
        fprintf(stderr, "Invalid server IP\n"); close(sock); return 1;
    }

    // Handshake: send SYN, wait for SYN-ACK
    scp_pkt_t pkt;
    memset(&pkt,0,sizeof(pkt));
    pkt.ver = PROTO_VER;
    pkt.type = T_SYN;
    pkt.seq = htonl(1);
    pkt.payload_len = htons(0);
    pkt.checksum = htons(0);

    int tries = 0;
    const int MAX_TRIES = 5;
    const int TIMEOUT_MS = 1500;

    while (tries < MAX_TRIES) {
        ssize_t sent = sendto(sock, &pkt, 8+4+2+2, 0, (struct sockaddr*)&servaddr, servlen);
        if (sent < 0) { perror("sendto"); close(sock); return 1; }
        // wait for reply with timeout
        fd_set rfds;
        struct timeval tv;
        FD_ZERO(&rfds); FD_SET(sock, &rfds);
        tv.tv_sec = TIMEOUT_MS/1000; tv.tv_usec = (TIMEOUT_MS%1000)*1000;
        int rv = select(sock+1, &rfds, NULL, NULL, &tv);
        if (rv > 0 && FD_ISSET(sock, &rfds)) {
            scp_pkt_t rsp;
            ssize_t n = recvfrom(sock, &rsp, sizeof(rsp), 0, NULL, NULL);
            if (n > 0 && rsp.type == T_SYNACK) {
                printf("Received SYN-ACK from server (seq=%u). Connection established.\n", ntohl(rsp.seq));
                break;
            }
        } else {
            printf("No SYN-ACK, retrying... (%d)\n", tries+1);
            tries++;
        }
    }
    if (tries == MAX_TRIES) {
        printf("Failed to handshake with server. Exiting.\n");
        close(sock); return 1;
    }

    // Chat: read lines from stdin and send as MSG
    uint32_t seq = 1;
    char line[600];
    printf("Enter messages to send. Type '/quit' to finish.\n");
    while (1) {
        printf("> ");
        if (!fgets(line, sizeof(line), stdin)) break;
        // strip newline
        size_t len = strlen(line);
        if (len && line[len-1]=='\n') { line[len-1]='\0'; len--; }

        if (strcmp(line, "/quit") == 0) {
            // send FIN and await FIN-ACK
            scp_pkt_t fin;
            memset(&fin,0,sizeof(fin));
            fin.ver = PROTO_VER; fin.type = T_FIN; fin.seq = htonl(seq);
            fin.payload_len = htons(0); fin.checksum = htons(0);
            sendto(sock, &fin, 8+4+2+2, 0, (struct sockaddr*)&servaddr, servlen);
            // wait for FIN-ACK (short wait)
            fd_set rfds; struct timeval tv;
            FD_ZERO(&rfds); FD_SET(sock, &rfds);
            tv.tv_sec = 2; tv.tv_usec = 0;
            if (select(sock+1, &rfds, NULL, NULL, &tv) > 0) {
                scp_pkt_t r; recvfrom(sock, &r, sizeof(r), 0, NULL, NULL);
                if (r.type == T_FINACK) {
                    printf("FIN-ACK received. Connection closed.\n");
                }
            }
            break;
        }

        // build MSG packet
        scp_pkt_t msg;
        memset(&msg,0,sizeof(msg));
        msg.ver = PROTO_VER;
        msg.type = T_MSG;
        msg.seq = htonl(seq);
        if (len > MAX_PAYLOAD) len = MAX_PAYLOAD;
        memcpy(msg.payload, line, len);
        msg.payload_len = htons((uint16_t)len);
        msg.checksum = htons(0);

        // compute checksum (optional). Here skip (set zero) for simplicity.
        // send and wait for MSG-ACK with retransmit
        int attempt = 0;
        const int MAX_ATTEMPT = 5;
        int acked = 0;
        while (attempt < MAX_ATTEMPT && !acked) {
            ssize_t sent = sendto(sock, &msg, 8+4+2+2 + len, 0, (struct sockaddr*)&servaddr, servlen);
            if (sent < 0) { perror("sendto"); break; }
            // wait for MSG-ACK
            fd_set rfds;
            struct timeval tv;
            FD_ZERO(&rfds); FD_SET(sock, &rfds);
            tv.tv_sec = 1; tv.tv_usec = 500000; // 1.5s
            int rv = select(sock+1, &rfds, NULL, NULL, &tv);
            if (rv > 0 && FD_ISSET(sock, &rfds)) {
                scp_pkt_t r;
                ssize_t n = recvfrom(sock, &r, sizeof(r), 0, NULL, NULL);
                if (n > 0 && r.type == T_MSGACK && ntohl(r.seq) == seq) {
                    printf("MSG-ACK received for seq=%u\n", seq);
                    acked = 1;
                    break;
                } else {
                    // ignore
                }
            } else {
                attempt++;
                printf("No ACK for seq=%u, retransmit (%d/%d)\n", seq, attempt, MAX_ATTEMPT);
            }
        }
        if (!acked) {
            printf("Failed to deliver message seq=%u after retries. Giving up on this message.\n", seq);
        } else {
            seq++;
        }
    }

    close(sock);
    printf("Client exiting.\n");
    return 0;
}
