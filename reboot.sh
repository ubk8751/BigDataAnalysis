#!/bin/bash

if [ "$1" = "-c" ]; then
    docker-compose -f all-at-once.yaml down
    docker system prune -f
fi

docker-compose -f all-at-once.yaml up --build