#!/bin/bash

if [ "$1" = "-c" ]; then
    docker-compose -f all-at-once.yaml down -v
    docker system prune -f
fi

docker-compose -f all-at-once.yaml up --build