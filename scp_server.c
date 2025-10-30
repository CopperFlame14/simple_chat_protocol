/* scp_server.c
 * Simple Chat Protocol (Server / Receiver) using UDP.
 * Compile: gcc -o scp_server scp_server.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>     // close()
#include <arpa/inet.h>  // htons, htonl, inet_addr
#include <sys/socket.h>
#include <errno.h>
#include <time.h>

#define SERVER_PORT 50000
#define BUFSIZE 600
#define MAX_PAYLOAD 512
#define PROTO_VER 1

/* Types */
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

/* compute simple checksum (sum of bytes) */
static uint16_t checksum_compute(const uint8_t *buf, size_t len) {
    uint32_t s = 0;
    for (size_t i = 0; i < len; ++i) s += buf[i];
    return (uint16_t)(s & 0xFFFF);
}

int main() {
    int sock;
    struct sockaddr_in servaddr, cliaddr;
    socklen_t cli_len = sizeof(cliaddr);
    scp_pkt_t pkt;
    ssize_t n;

    sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) { perror("socket"); exit(1); }

    memset(&servaddr, 0, sizeof(servaddr));
    servaddr.sin_family = AF_INET;
    servaddr.sin_addr.s_addr = INADDR_ANY; // 0.0.0.0
    servaddr.sin_port = htons(SERVER_PORT);

    if (bind(sock, (struct sockaddr*)&servaddr, sizeof(servaddr)) < 0) {
        perror("bind"); close(sock); exit(1);
    }

    printf("SCP Server listening on port %d (UDP)\n", SERVER_PORT);
    uint32_t expected_seq = 0; // last delivered seq

    while (1) {
        memset(&pkt, 0, sizeof(pkt));
        n = recvfrom(sock, &pkt, sizeof(pkt), 0, (struct sockaddr*)&cliaddr, &cli_len);
        if (n < 0) { perror("recvfrom"); continue; }

        // verify version & basic fields
        if (pkt.ver != PROTO_VER) {
            printf("Received packet with wrong version %d\n", pkt.ver);
            continue;
        }

        uint16_t plen = ntohs(pkt.payload_len);
        uint16_t csum_recv = ntohs(pkt.checksum);
        // recompute checksum over header+payload (set checksum to 0 for computation)
        uint16_t saved_chk = pkt.checksum;
        pkt.checksum = 0;
        uint16_t csum_calc = checksum_compute((uint8_t*)&pkt, 8 + 4 + 2 + 2 + plen); // header bytes approximation
        // restore
        pkt.checksum = saved_chk;
        // For simplicity allow if checksum matches or payload_len is zero
        if (csum_recv != 0 && csum_recv != csum_calc) {
            printf("Checksum mismatch (recv %u calc %u). Ignoring packet.\n", csum_recv, csum_calc);
            continue;
        }

        if (pkt.type == T_SYN) {
            printf("[SYN] from %s:%d seq=%u\n",
                inet_ntoa(cliaddr.sin_addr), ntohs(cliaddr.sin_port), ntohl(pkt.seq));
            // Reply with SYN-ACK
            scp_pkt_t rsp;
            memset(&rsp, 0, sizeof(rsp));
            rsp.ver = PROTO_VER;
            rsp.type = T_SYNACK;
            rsp.seq = htonl(100); // server initial seq (arbitrary)
            rsp.payload_len = htons(0);
            rsp.checksum = htons(0);
            sendto(sock, &rsp, 8+4+2+2, 0, (struct sockaddr*)&cliaddr, cli_len);
            printf(" -> Sent SYN-ACK\n");
        }
        else if (pkt.type == T_FIN) {
            printf("[FIN] Received close request. Sending FIN-ACK and exiting.\n");
            scp_pkt_t rsp;
            memset(&rsp, 0, sizeof(rsp));
            rsp.ver = PROTO_VER; rsp.type = T_FINACK; rsp.seq = htonl(pkt.seq);
            rsp.payload_len = htons(0); rsp.checksum = htons(0);
            sendto(sock, &rsp, 8+4+2+2, 0, (struct sockaddr*)&cliaddr, cli_len);
            break;
        }
        else if (pkt.type == T_MSG) {
            uint32_t seq = ntohl(pkt.seq);
            size_t payload_len = plen;
            char text[MAX_PAYLOAD+1];
            if (payload_len > 0) {
                memcpy(text, pkt.payload, payload_len);
                text[payload_len] = '\0';
            } else text[0] = '\0';

            // Duplicate detection: simple example
            if (seq == expected_seq) {
                // If first message, expected_seq=0 -> deliver and set expected_seq = seq+1
                printf("[MSG] seq=%u payload='%s'\n", seq, text);
                expected_seq = seq + 1;
            } else if (seq < expected_seq) {
                printf("[MSG duplicate] seq=%u (already delivered). Re-ACKing.\n", seq);
            } else {
                // Out-of-order: accept but note it
                printf("[MSG out-of-order] seq=%u payload='%s' (expected %u)\n", seq, text, expected_seq);
                expected_seq = seq + 1;
            }

            // send MSG-ACK
            scp_pkt_t ack;
            memset(&ack, 0, sizeof(ack));
            ack.ver = PROTO_VER;
            ack.type = T_MSGACK;
            ack.seq = htonl(seq);
            ack.payload_len = htons(0);
            ack.checksum = htons(0);
            sendto(sock, &ack, 8+4+2+2, 0, (struct sockaddr*)&cliaddr, cli_len);
            printf(" -> Sent MSG-ACK for seq=%u\n", seq);
        }
        else {
            printf("Unknown packet type 0x%02x\n", pkt.type);
        }
    }

    close(sock);
    printf("Server exiting.\n");
    return 0;
}
