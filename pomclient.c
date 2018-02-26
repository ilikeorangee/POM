#include "pomclient.h"

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netdb.h>

void (*notif_handler)(char*);
char req_error[64];

/**
* Attempt to load the device POM with the given filename into a memory
* Return pointer to location in memory of the POM when successful
*/
const char *load_POM(const char *filename) {

	FILE *fp;
	long size;
	char *fbuffer;

	fp = fopen (filename , "rb");
	
	if (!fp)
		_error("[load_POM] Error opening file");

	fseek(fp , 0L , SEEK_END);
	size = ftell(fp);
	fbuffer = calloc(1, size+1);
	rewind(fp);
	
	if (!fbuffer) {
		fclose(fp);
		_error("[load_POM] Memory allocation failed");
	}

	if (1 != fread(fbuffer, size, 1 , fp) ) {
		fclose(fp);
		free(fbuffer);
		_error("[load_POM] Error reading file");
	}
	
	fclose(fp);		
	return fbuffer;
}


/**
 * Attempt to register device POM with server
 */
int register_POM(int sockfd, const char *client_POM, char *client_ID, char* server_ID) {
	
	int n, type, action, status;
	char response[BUFFER_SIZE];
	
	n = write(sockfd, client_POM, strlen(client_POM));
	
	if (n < 0)
		_error("[register_POM] failed writing to socket");
	
	read(sockfd, response, BUFFER_SIZE - 1);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,\"deviceID\":\"%[^\"]\",\"serverID\":\"%[^\"]\"}",
		&type,
		&action,
		&status,
		client_ID,
		server_ID
	);
	return status;
}


/**
 * Send request to retrieve the value of the specified element
 */
int get_element_value(int sockfd, char *device_ID, char *element_ID, char *value) {
	
	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		GET_VALUE,
		device_ID,
		element_ID
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[get_element] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"value\":\"%[^\"]}",
		dID,
		eID,
		value
	);
	return status;
}


/**
 * Send request to set the value of the specified element
 */
int set_element_value(int sockfd, char *device_ID, char *element_ID, char *value) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], val[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"value\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		SET_VALUE,
		device_ID,
		element_ID,
		value
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[set_element] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"value\":\"%[^\"]}",
		dID,
		eID,
		val
	);
	return status;
}


/**
 * Send request to insert an element node with the given tag name and value
 */
int insert_element_node(int sockfd, char *device_ID, char *parent_ID, char *tag_name, char *element_ID, char *value) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], pID[32], tag[32], eID[32], val[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"parentID\":\"%s\", \"tag\":\"%s\", \"elementID\":\"%s\", \"value\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		INSERT_NODE,
		device_ID,
		parent_ID,
		tag_name,
		element_ID,
		value
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[insert_element] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"parentID\":\"%[^\"]\",\"tag\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"value\":\"%[^\"]\"}",
		dID,
		pID,
		tag,
		eID,
		val
	);
	return status;
}


/**
 * Send request to remove the specified element node
 */
int remove_element_node(int sockfd, char *device_ID, char *element_ID) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		REMOVE_NODE,
		device_ID,
		element_ID
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[remove_element] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\"}",
		dID,
		eID
	);
	return status;
}


/**
 * Send request to retrieve the value of the specified attribute
 */
int get_attr_value(int sockfd, char *device_ID, char *element_ID, char *attr_name, char *value) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], attr[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"attr\":\"%s\"}",
		REQUEST,
		ATTRIBUTE_NODE,
		GET_VALUE,
		device_ID,
		element_ID,
		attr_name
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[get_attr_value] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"attr\":\"%[^\"]\",\"value\":\"%[^\"]\"}",
		dID,
		eID,
		attr,
		value
	);
	return status;
}


/**
 * Send request to retrieve the value of the specified attribute
 */
int set_attr_value(int sockfd, char* device_ID, char *element_ID, char *attr_name, char *value) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], attr[32], val[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"attr\":\"%s\", \"value\":\"%s\"}",
		REQUEST,
		ATTRIBUTE_NODE,
		SET_VALUE,
		device_ID,
		element_ID,
		attr_name,
		value
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[set_attr_value] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"attr\":\"%[^\"]\",\"value\":\"%[^\"]\"}",
		dID,
		eID,
		attr,
		val
	);
	return status;
}


/**
 * Send request to insert an attribute node with the given name and value
 */
int insert_attr_node(int sockfd, char *device_ID, char *element_ID, char *attr_name, char *value) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], attr[32], val[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"attr\":\"%s\", \"value\":\"%s\"}",
		REQUEST,
		ATTRIBUTE_NODE,
		INSERT_NODE,
		device_ID,
		element_ID,
		attr_name,
		value
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[insert_attr_node] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"attr\":\"%[^\"]\",\"value\":\"%[^\"]\"}",
		dID,
		eID,
		attr,
		val
	);
	return status;
}


/**
 * Send request to remove the specified attribute
 */
int remove_attr_node(int sockfd, char *device_ID, char *element_ID, char *attr_name) {

	int n, type, action, status;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], attr[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"attr\":\"%s\"}",
		REQUEST,
		ATTRIBUTE_NODE,
		REMOVE_NODE,
		device_ID,
		element_ID,
		attr_name
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[remove_attr_node] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"attr\":\"%[^\"]\"}",
		dID,
		eID,
		attr
	);
	return status;
}


/**
 * Send request to attach an event listener for the given event type on the specified node
 */
int subscribe_event(int sockfd, char *device_ID, char *element_ID, int event, int capture) {

	int n, type, action, status, evt, cpt;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"event\":%d, \"capture\":%d}",
		REQUEST,
		ELEMENT_NODE,
		SUBSCRIBE,
		device_ID,
		element_ID,
		event,
		capture
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
			_error("[subscribe_event] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"event\":%d,\"capture\":%d}",
		dID,
		eID,
		&evt,
		&cpt
	);
	return status;
}


/**
 * Send request to remove the event listener for the given event type on the specified node
 */
int unsubscribe_event(int sockfd, char *device_ID, char *element_ID, int event, int capture) {

	int n, type, action, status, evt, cpt;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"event\":%d, \"capture\":%d}",
		REQUEST,
		ELEMENT_NODE,
		UNSUBSCRIBE,
		device_ID,
		element_ID,
		event,
		capture
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[unsubscribe_event] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"event\":%d,\"capture\":%d}",
		dID,
		eID,
		&evt,
		&cpt
	);
	return status;
}


/**
 * Send request to attach an advertisement for the given service type on the specified node
 */
int add_service(int sockfd, char *device_ID, char *element_ID, char *service, char *control_ID) {

	int n, type, action, status, evt;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], serv[32], cID[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"event\":%d, \"service\":\"%s\", \"controlID\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		ADD_SERVICE,
		device_ID,
		element_ID,
		SERVICE_REQUEST,
		service,
		control_ID
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
			_error("[add_service] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"event\":%d,\"service\":\"%[^\"],\"controlID\":\"%[^\"]}",
		dID,
		eID,
		&evt,
		serv,
		cID
	);
	return status;
}


/**
 * Send request to remove the advertisement for the given service type on the specified node
 */
int drop_service(int sockfd, char *device_ID, char *element_ID, char *service) {

	int n, type, action, status, evt;
	char request[BUFFER_SIZE], response[BUFFER_SIZE], dID[32], eID[32], serv[32];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"event\":%d, \"service\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		DROP_SERVICE,
		device_ID,
		element_ID,
		SERVICE_REQUEST,
		service
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
		_error("[drop_service] failed writing to socket");

	_wait_for_reply(sockfd, response);
	sscanf(response, "{\"format\":%*d,\"type\":%d,\"action\":%d,\"status\":%d,%*s", &type, &action, &status);

	if (status == 1) {
		sscanf(response, "{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"message\":\"%[^\"]\"}", req_error);
		return status;
	}

	sscanf(
		response,
		"{\"format\":%*d,\"type\":%*d,\"action\":%*d,\"status\":%*d,\"deviceID\":\"%[^\"]\",\"elementID\":\"%[^\"]\",\"event\":%d,\"service\":\"%[^\"]}",
		dID,
		eID,
		&evt,
		serv
	);
	return status;
}


/**
 * Send request to search for the given service at the specified node
 */
int locate_service(int sockfd, char *device_ID, char *element_ID, char *service) {

	int n;
	char request[BUFFER_SIZE];

	sprintf(
		request,
		"{\"format\":%d, \"type\":%d, \"action\":%d, \"deviceID\":\"%s\", \"elementID\":\"%s\", \"service\":\"%s\"}",
		REQUEST,
		ELEMENT_NODE,
		LOCATE_SERVICE,
		device_ID,
		element_ID,
		service
	);
	n = write(sockfd, request, strlen(request));

	if (n < 0)
			_error("[add_service] failed writing to socket");

	return 0;
}


/**
* Attempt to connect to the given host and port number
* Return the socket file descriptor if successful
*/
int connect_server(char *hostname, char *port) {
	
	int sockfd, portno;
	struct hostent* server;
	struct sockaddr_in serv_addr;

	portno = atoi(port);
	sockfd = socket(AF_INET, SOCK_STREAM, 0);

	if (sockfd < 0) 
		_error("[connect_server] Error opening socket");
		
	server = gethostbyname(hostname);

	if (server == NULL) {
		fprintf(stderr,"[connect_server] No such host\n");
		exit(0);
	}

	bzero((char*) &serv_addr, sizeof(serv_addr));
	serv_addr.sin_family = AF_INET;

	bcopy((char*) server->h_addr, (char*) &serv_addr.sin_addr.s_addr, server->h_length);
	serv_addr.sin_port = htons(portno);

	if (connect(sockfd,(struct sockaddr *) &serv_addr,sizeof(serv_addr)) < 0) 
		_error("[connect_server] Unable to connect to host");
	
	return sockfd;	
}


/**
* Close the connection to the host
*/
void disconnect_server(int sockfd) {
	close(sockfd);
}


/**
 * Sets the handler function used to process notifcations
 */
void set_notif_handler(void (*handler)(char*)) {
	notif_handler = handler;
}


/**
 * Sets up epoll
 * Returns epoll file descriptor
 */
int epoll_setup(int maxfds) {
  int efd;

  efd = epoll_create(maxfds);
  if (efd == -1)
    _error("epoll_create");

  return efd;
}


/**
 * Set epoll to read from specified file descriptor
 */
void epoll_read_fd(int epfd, int fd) {
  struct epoll_event ev;

  ev.data.fd = fd;
  ev.events = EPOLLIN;
  if (epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev) == -1)
    _error("epoll_ctl");
}


/**
 * Waits for reply from server
 * Invokes notification handler if a notification is received
 */
void _wait_for_reply(int sockfd, char *response) {

	int format = 0;

	read(sockfd, response, BUFFER_SIZE - 1);
	sscanf(response, "{\"format\":%d,%*s", &format);

	while (format == 2) {
		notif_handler(response);
		format = 0;
		memset(response, 0, BUFFER_SIZE - 1);
		read(sockfd, response, BUFFER_SIZE - 1);
		sscanf(response, "{\"format\":%d,%*s", &format);
	}
}


/**
* Print to STDERR and return exit status 1
*/
void _error(const char *msg) {
	perror(msg);
	exit(1);
}
