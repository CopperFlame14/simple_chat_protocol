/*
 * scp_server.c - Simple Chat Protocol Server
 * Listens on port 8080 and handles SCP messages
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 5

// Function to parse SCP message
void parse_scp_message(char* buffer, char* msg_type, 
                       int* msg_id, char* payload) {
    // Format: SCP/1.0 | MSG_TYPE | id=X | PAYLOAD
    char* token;
    char temp[BUFFER_SIZE];
    strcpy(temp, buffer);
    
    // Skip "SCP/1.0"
    token = strtok(temp, "|");
    
    // Get message type
    token = strtok(NULL, "|");
    if (token) {
        sscanf(token, " %s", msg_type);
    }
    
    // Get message ID
    token = strtok(NULL, "|");
    if (token) {
        sscanf(token, " id=%d", msg_id);
    }
    
    // Get payload
    token = strtok(NULL, "|");
    if (token) {
        strcpy(payload, token + 1); // Skip leading space
    }
}

// Function to create SCP ACK message
void create_ack(char* buffer, int msg_id) {
    sprintf(buffer, "SCP/1.0 | ACK | id=%d | MSG_RECEIVED", msg_id);
}

// Get current timestamp
void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

int main() {
    int server_fd, client_socket;
    struct sockaddr_in address;
    int addrlen = sizeof(address);
    char buffer[BUFFER_SIZE] = {0};
    char msg_type[50], payload[BUFFER_SIZE];
    int msg_id;
    char timestamp[20];
    
    printf("═══════════════════════════════════════════\n");
    printf("  Simple Chat Protocol (SCP) Server v1.0\n");
    printf("═══════════════════════════════════════════\n\n");
    
    // Create socket
    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }
    
    // Set socket options
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, 
                   &opt, sizeof(opt))) {
        perror("Setsockopt failed");
        exit(EXIT_FAILURE);
    }
    
    // Configure address
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);
    
    // Bind socket to port
    if (bind(server_fd, (struct sockaddr*)&address, 
             sizeof(address)) < 0) {
        perror("Bind failed");
        exit(EXIT_FAILURE);
    }
    
    // Listen for connections
    if (listen(server_fd, MAX_CLIENTS) < 0) {
        perror("Listen failed");
        exit(EXIT_FAILURE);
    }
    
    printf("🟢 Server listening on port %d...\n\n", PORT);
    
    // Accept client connection
    if ((client_socket = accept(server_fd, 
         (struct sockaddr*)&address, (socklen_t*)&addrlen)) < 0) {
        perror("Accept failed");
        exit(EXIT_FAILURE);
    }
    
    printf("✓ Client connected from %s:%d\n\n", 
           inet_ntoa(address.sin_addr), 
           ntohs(address.sin_port));
    
    // Main message handling loop
    while (1) {
        memset(buffer, 0, BUFFER_SIZE);
        memset(msg_type, 0, sizeof(msg_type));
        memset(payload, 0, sizeof(payload));
        
        // Receive message from client
        int bytes_read = read(client_socket, buffer, BUFFER_SIZE);
        
        if (bytes_read <= 0) {
            printf("Client disconnected\n");
            break;
        }
        
        // Parse the SCP message
        parse_scp_message(buffer, msg_type, &msg_id, payload);
        
        get_timestamp(timestamp);
        printf("[%s] RECV: %s\n", timestamp, buffer);
        
        // Handle different message types
        if (strcmp(msg_type, "HELLO") == 0) {
            printf("         → Connection request from: %s\n", payload);
            
            // Send ACK
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\n\n", timestamp, ack);
            
        } else if (strcmp(msg_type, "MSG") == 0) {
            printf("         → Message: %s\n", payload);
            
            // Send ACK
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\n\n", timestamp, ack);
            
        } else if (strcmp(msg_type, "BYE") == 0) {
            printf("         → Client requesting disconnect\n");
            
            // Send final ACK
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\n\n", timestamp, ack);
            printf("Connection closed by client\n");
            break;
            
        } else {
            printf("         → Unknown message type: %s\n\n", msg_type);
        }
    }
    
    close(client_socket);
    close(server_fd);
    
    printf("\n═══════════════════════════════════════════\n");
    printf("  Server shutdown complete\n");
    printf("═══════════════════════════════════════════\n");
    
    return 0;
}
