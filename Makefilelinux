CC = gcc
CFLAGS = -Wall -g -ggdb

all: pomclient.o pomcli.o test

test: pomcli.o pomclient.o
	$(CC) $(CFLAGS) -o test pomcli.o pomclient.o

testclient.o: pomcli.c pomclient.h
	$(CC) $(CFLAGS) pomcli.c -c

pomclient.o: pomclient.c pomclient.h
	$(CC) $(CFLAGS) pomclient.c -c
 
clean:
	rm *.o test
