/*
 * scp_client.c - Simple Chat Protocol Client
 * Connects to server and sends SCP messages with ACK handling
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define ACK_TIMEOUT 5      // 5 seconds
#define MAX_RETRIES 3

int message_id_counter = 0;

// Get timestamp
void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

// Create SCP message
void create_scp_message(char* buffer, const char* msg_type, 
                        int msg_id, const char* payload) {
    sprintf(buffer, "SCP/1.0 | %s | id=%d | %s", 
            msg_type, msg_id, payload);
}

// Parse ACK message to extract ID
int parse_ack(char* buffer) {
    int ack_id = -1;
    char* token = strtok(buffer, "|");
    
    while (token != NULL) {
        if (strstr(token, "id=") != NULL) {
            sscanf(token, " id=%d", &ack_id);
            break;
        }
        token = strtok(NULL, "|");
    }
    return ack_id;
}

// Send message with ACK wait and retry logic
int send_with_ack(int sock, const char* msg_type, 
                  const char* payload) {
    char send_buffer[BUFFER_SIZE];
    char recv_buffer[BUFFER_SIZE];
    char timestamp[20];
    int msg_id = message_id_counter++;
    int retries = 0;
    struct timeval tv;
    
    while (retries <= MAX_RETRIES) {
        // Create and send message
        create_scp_message(send_buffer, msg_type, msg_id, payload);
        
        get_timestamp(timestamp);
        printf("[%s] SEND (try %d): %s\n", 
               timestamp, retries + 1, send_buffer);
        
        send(sock, send_buffer, strlen(send_buffer), 0);
        
        // Set timeout for receiving ACK
        tv.tv_sec = ACK_TIMEOUT;
        tv.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, 
                   &tv, sizeof(tv));
        
        // Wait for ACK
        memset(recv_buffer, 0, BUFFER_SIZE);
        int bytes_read = read(sock, recv_buffer, BUFFER_SIZE);
        
        if (bytes_read > 0) {
            // Parse ACK
            int ack_id = parse_ack(recv_buffer);
            
            get_timestamp(timestamp);
            printf("[%s] RECV: %s\n", timestamp, recv_buffer);
            
            if (ack_id == msg_id) {
                printf("         ✓ ACK received for id=%d\n\n", msg_id);
                return 1; // Success
            } else {
                printf("         ✗ ACK mismatch (expected %d, got %d)\n\n", 
                       msg_id, ack_id);
            }
        } else {
            get_timestamp(timestamp);
            printf("[%s] ⚠ TIMEOUT: No ACK received for id=%d\n", 
                   timestamp, msg_id);
            retries++;
            
            if (retries <= MAX_RETRIES) {
                printf("         → Retrying... (%d/%d)\n\n", 
                       retries, MAX_RETRIES);
            }
        }
    }
    
    printf("         ✗ FAILED: Message delivery failed after %d retries\n\n", 
           MAX_RETRIES);
    return 0; // Failure
}

int main() {
    int sock = 0;
    struct sockaddr_in serv_addr;
    char username[100];
    char message[BUFFER_SIZE];
    
    printf("═══════════════════════════════════════════\n");
    printf("  Simple Chat Protocol (SCP) Client v1.0\n");
    printf("═══════════════════════════════════════════\n\n");
    
    // Get username
    printf("Enter your name: ");
    fgets(username, sizeof(username), stdin);
    username[strcspn(username, "\n")] = 0; // Remove newline
    
    // Create socket
    if ((sock = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        printf("\n✗ Socket creation error\n");
        return -1;
    }
    
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(PORT);
    
    // Convert IPv4 address from text to binary
    if (inet_pton(AF_INET, "127.0.0.1", &serv_addr.sin_addr) <= 0) {
        printf("\n✗ Invalid address / Address not supported\n");
        return -1;
    }
    
    // Connect to server
    printf("Connecting to server at 127.0.0.1:%d...\n", PORT);
    if (connect(sock, (struct sockaddr*)&serv_addr, 
                sizeof(serv_addr)) < 0) {
        printf("\n✗ Connection failed\n");
        return -1;
    }
    
    printf("✓ Connected to server\n\n");
    
    // Send HELLO message
    printf("─────────────────────────────────────────\n");
    printf("Sending connection request...\n");
    printf("─────────────────────────────────────────\n");
    if (!send_with_ack(sock, "HELLO", username)) {
        printf("Failed to establish connection\n");
        close(sock);
        return -1;
    }
    
    printf("═══════════════════════════════════════════\n");
    printf("  Chat session started\n");
    printf("  Type 'quit' to exit\n");
    printf("═══════════════════════════════════════════\n\n");
    
    // Main chat loop
    while (1) {
        printf("You: ");
        fgets(message, BUFFER_SIZE, stdin);
        message[strcspn(message, "\n")] = 0; // Remove newline
        
        if (strlen(message) == 0) {
            continue;
        }
        
        if (strcmp(message, "quit") == 0) {
            printf("\nSending disconnect request...\n");
            printf("─────────────────────────────────────────\n");
            send_with_ack(sock, "BYE", "DISCONNECT");
            break;
        }
        
        printf("─────────────────────────────────────────\n");
        send_with_ack(sock, "MSG", message);
    }
    
    close(sock);
    
    printf("\n═══════════════════════════════════════════\n");
    printf("  Disconnected from server\n");
    printf("═══════════════════════════════════════════\n");
    
    return 0;
}
