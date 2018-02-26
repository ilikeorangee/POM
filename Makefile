CC = gcc
CFLAGS = -Wall -g -ggdb

all: pomclientmac.o pomclimac.o test

test: pomclimac.o pomclientmac.o
	$(CC) $(CFLAGS) -o test pomclimac.o pomclientmac.o

testclient.o: pomclimac.c pomclientmac.h
	$(CC) $(CFLAGS) pomclimac.c -c

pomclientmac.o: pomclientmac.c pomclientmac.h
	$(CC) $(CFLAGS) pomclientmac.c -c
 
clean:
	rm *.o test
