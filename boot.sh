#!/bin/bash

help() {
    local message="$1"
    echo "$message"
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  h: Print help menu."
    echo "  c: Run the docker-compose down command."
    echo "  v: Include the '-v' flag in docker-compose down."
    echo "  i: Include the '--rmi all' flag in docker-compose down."
    echo "     If used you will need to rebuild the images monitortool and"
    echo "     clone-detector locally"
    echo "  p: Include 'p' to run docker system prune."
    echo "  b: Include the '--build' option when running docker-compose up."
    echo "  u: Include the -u flag when building the monitortoolcontainer."
    echo "     Activates 'flush' and deactivates stdin/stdout buffering."
    exit 1
}

options=""
boptions=""
prune=""
u_flag=""
use_c=false
p_include_u=false


args="$@"

# Check for the help flag
if [[ "$1" == "h" ]]; then
    help "HELP MENU"
fi

# Iterate over each character in args
for ((i = 0; i < ${#args}; i++)); do
    letter="${args:$i:1}"
    case "$letter" in
        c)
            use_c=true
            ;;
        v)
            options="$options -v"
            ;;
        i)
            options="$options --rmi all"
            ;;
        p)
            prune="yes"
            ;;
        b)
            boptions="$boptions --build"
            ;;
        u)  # Remove the * before -u
            p_include_u=true
            ;;
        *)
            help "Invalid option: $letter"
            ;;
    esac
done

if [ "$p_include_u" = true ]; then
    u_flag="-u"
fi

if [ -n "$use_c" ]; then
    docker-compose -f all-at-once.yaml down $options
fi

if [ -n "$prune" ]; then
    docker system prune -f
fi

export FLAGS="$u_flag"

docker-compose -f all-at-once.yaml up $boptions
