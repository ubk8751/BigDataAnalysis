#!/bin/bash

if [ "$1" == "-c" ] && [ -z "$2" ]; then
    echo "Usage: $0 -c [OPTIONS]"
    echo "Options:"
    echo "  c: Run the docker-compose down command"
    echo "  v: Include the '-v' flag in docker-compose down"
    echo "  i: Include the '--rmi all' flag in docker-compose down"
    echo "  p: Include 'p' to run docker system prune"
    exit 1
fi

options=""

while getopts "vip" opt; do
    case $opt in
        v)
            options="$options -v"
            ;;
        i)
            options="$options --rmi all"
            ;;
        p)
            prune="yes"
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
            exit 1
            ;;
    esac
done

if [ "$1" == "-c" ] && ["c" in ]; then
    docker-compose -f all-at-once.yaml down $options
fi

if [ "$prune" == "yes" ]; then
    docker system prune -f
fi

docker-compose -f all-at-once.yaml up --build
