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
#include <unistd.h>
#include <arpa/inet.h>
#include <pthread.h>

#define PORT 8080
#define BUFFER_SIZE 1024

int sockfd;

void *receive_messages(void *arg) {
    char buffer[BUFFER_SIZE];
    while (1) {
        memset(buffer, 0, sizeof(buffer));
        int bytes = recv(sockfd, buffer, sizeof(buffer), 0);
        if (bytes <= 0) {
            printf("\nConnection closed by server.\n");
            break;
        }
        printf("\n[Server]: %s\n> ", buffer);
        fflush(stdout);
    }
    return NULL;
}

int main() {
    struct sockaddr_in server_addr;
    char buffer[BUFFER_SIZE];

    sockfd = socket(AF_INET, SOCK_STREAM, 0);
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    connect(sockfd, (struct sockaddr*)&server_addr, sizeof(server_addr));
    printf("Connected to SCP Server!\n");

    pthread_t recv_thread;
    pthread_create(&recv_thread, NULL, receive_messages, NULL);

    while (1) {
        printf("> ");
        fgets(buffer, sizeof(buffer), stdin);
        buffer[strcspn(buffer, "\n")] = 0;

        if (strcmp(buffer, "exit") == 0) {
            send(sockfd, "SCP|BYE|Client|", strlen("SCP|BYE|Client|"), 0);
            break;
        }

        char message[BUFFER_SIZE];
        snprintf(message, sizeof(message), "SCP|MSG|Client|%s", buffer);
        send(sockfd, message, strlen(message), 0);
    }

    close(sockfd);
    return 0;
}
