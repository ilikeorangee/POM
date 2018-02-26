#ifndef POM_CLIENT_H
#define POM_CLIENT_H

#define BUFFER_SIZE		256

typedef enum {
	REQUEST,
	REPLY,
	NOTIFICATION
} MessageFormat;

typedef enum {
	ELEMENT_NODE 	= 1,
	ATTRIBUTE_NODE 	= 2,
	TEXT_NODE 		= 3
} NodeType;

typedef enum {
	REGISTER,
	GET_VALUE,
	SET_VALUE,
	INSERT_NODE,
	REMOVE_NODE,
	SUBSCRIBE,
	UNSUBSCRIBE,
	ADD_SERVICE,
	DROP_SERVICE,
	LOCATE_SERVICE
} Action;

typedef enum {
	REQUEST_COMPLETED,
	REQUEST_ERROR
} Status;

typedef enum {
	SUBTREE_MODIFIED,
	ELEMENT_INSERTED,
	ELEMENT_REMOVED,
	ATTR_MODIFIED,
	CHARACTER_DATA_MODIFIED,
	DEVICE_REGISTERED,
	DEVICE_UNREGISTERED,
	SERVICE_REQUEST,
	SERVICE_LOCATED
} POM_Event;

typedef enum {false, true} bool;

extern char req_error[64];

const char *load_POM(const char *filename);
void set_notif_handler(void (*handler)(char*));
int register_POM(int sockfd, const char *client_POM, char *client_ID, char* server_ID);
int get_element_value(int sockfd, char *device_ID, char *element_ID, char *value);
int set_element_value(int sockfd, char *device_ID, char *element_ID, char *value);
int insert_element_node(int sockfd, char *device_ID, char *parent_ID,  char *tag, char *element_ID, char *value);
int remove_element_node(int sockfd, char *device_ID, char *element_ID);
int get_attr_value(int sockfd, char *device_ID, char *element_ID, char *attr, char *value);
int set_attr_value(int sockfd, char *device_ID, char *element_ID, char *attr, char *value);
int insert_attr_node(int sockfd, char *device_ID, char *element_ID, char *attr, char *value);
int remove_attr_node(int sockfd, char *device_ID, char *element_ID, char *attr);
int subscribe_event(int sockfd, char *device_ID, char *element_ID, int event, int capture);
int unsubscribe_event(int sockfd, char *device_ID, char *element_ID, int event, int capture);
int add_service(int sockfd, char *device_ID, char *element_ID, char *service, char *control_ID);
int drop_service(int sockfd, char *device_ID, char *element_ID, char *service);
int locate_service(int sockfd, char *device_ID, char *element_ID, char *service);
int connect_server(char *hostname, char *port);
void disconnect_server(int sockfd);
int epoll_setup(int maxfds);
void epoll_read_fd(int epfd, int fd);

void _wait_for_reply(int sockfd, char *response);
void _error(const char *msg);

#endif
