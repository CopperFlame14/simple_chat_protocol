/* scp_server.c
 * Simple Chat Protocol (Server / Receiver) using UDP.
 * Compile: gcc -o scp_server scp_server.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#define PORT 8080
#define BUFFER_SIZE 1024

int main() {
    int sock, client_socket;
    struct sockaddr_in server_addr, client_addr;
    char buffer[BUFFER_SIZE];
    socklen_t addr_len = sizeof(client_addr);

    // Create socket
    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }

    // Define server address
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    // Bind socket
    if (bind(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("Bind failed");
        close(sock);
        exit(EXIT_FAILURE);
    }

    // Listen for incoming connections
    if (listen(sock, 3) < 0) {
        perror("Listen failed");
        close(sock);
        exit(EXIT_FAILURE);
    }

    printf("SCP Server running on port %d...\n", PORT);

    // Accept a client connection
    client_socket = accept(sock, (struct sockaddr*)&client_addr, &addr_len);
    if (client_socket < 0) {
        perror("Accept failed");
        close(sock);
        exit(EXIT_FAILURE);
    }

    printf("Client connected!\n");

    // Chat loop
    while (1) {
        memset(buffer, 0, BUFFER_SIZE);
        int bytes_received = recv(client_socket, buffer, BUFFER_SIZE, 0);
        if (bytes_received <= 0) {
            printf("Client disconnected.\n");
            break;
        }

        printf("Client: %s\n", buffer);

        // Prepare acknowledgment
        char ack_msg[BUFFER_SIZE];
        snprintf(ack_msg, sizeof(ack_msg), "SCP|ACK|Server|Message received: %s", buffer);

        send(client_socket, ack_msg, strlen(ack_msg), 0);

        // Optionally, allow the server to send messages too
        printf("Enter server reply (or type 'exit'): ");
        fgets(buffer, BUFFER_SIZE, stdin);
        buffer[strcspn(buffer, "\n")] = 0; // remove newline

        if (strcmp(buffer, "exit") == 0) {
            printf("Closing connection...\n");
            break;
        }

        send(client_socket, buffer, strlen(buffer), 0);
    }

    close(client_socket);
    close(sock);
    printf("Server exiting.\n");
    return 0;
}
