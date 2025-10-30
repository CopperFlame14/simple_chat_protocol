/* scp_server.c
 * Simple Chat Protocol (Server / Receiver) using UDP.
 * Compile: gcc -o scp_server scp_server.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <pthread.h>

#define PORT 8080
#define BUFFER_SIZE 1024

int client_socket;

void *receive_messages(void *arg) {
    char buffer[BUFFER_SIZE];
    while (1) {
        memset(buffer, 0, sizeof(buffer));
        int bytes = recv(client_socket, buffer, sizeof(buffer), 0);
        if (bytes <= 0) {
            printf("\nConnection closed by client.\n");
            break;
        }
        printf("\n[Client]: %s\n> ", buffer);
        fflush(stdout);
    }
    return NULL;
}

int main() {
    int server_socket;
    struct sockaddr_in server_addr, client_addr;
    socklen_t addr_size;
    char buffer[BUFFER_SIZE];

    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = INADDR_ANY;

    bind(server_socket, (struct sockaddr*)&server_addr, sizeof(server_addr));
    listen(server_socket, 1);
    printf("SCP Server waiting for connection on port %d...\n", PORT);

    addr_size = sizeof(client_addr);
    client_socket = accept(server_socket, (struct sockaddr*)&client_addr, &addr_size);
    printf("Client connected!\n");

    pthread_t recv_thread;
    pthread_create(&recv_thread, NULL, receive_messages, NULL);

    while (1) {
        printf("> ");
        fgets(buffer, sizeof(buffer), stdin);
        buffer[strcspn(buffer, "\n")] = 0;

        if (strcmp(buffer, "exit") == 0) {
            send(client_socket, "SCP|BYE|Server|", strlen("SCP|BYE|Server|"), 0);
            break;
        }

        char message[BUFFER_SIZE];
        snprintf(message, sizeof(message), "SCP|MSG|Server|%s", buffer);
        send(client_socket, message, strlen(message), 0);
    }

    close(client_socket);
    close(server_socket);
    return 0;
}

    close(sock);
    printf("Server exiting.\n");
    return 0;
}
