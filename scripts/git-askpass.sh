#!/bin/bash

# Git askpass script that reads credentials from .env.local
# This script ensures only tripleh1701-dev user can push

# Load environment variables from .env.local if it exists
if [ -f "$(dirname "$0")/../.env.local" ]; then
    source "$(dirname "$0")/../.env.local"
fi

# Verify we're using the correct user
if [ "$GIT_USERNAME" != "tripleh1701-dev" ]; then
    echo "Error: Only tripleh1701-dev user is allowed to push. Current user: $GIT_USERNAME" >&2
    exit 1
fi

# Check what's being asked for
case "$1" in
    *Username*)
        echo "$GIT_USERNAME"
        ;;
    *Password*)
        if [ -z "$GIT_PAT" ]; then
            echo "Error: GIT_PAT not set in .env.local" >&2
            exit 1
        fi
        echo "$GIT_PAT"
        ;;
    *)
        echo "Unknown credential request: $1" >&2
        exit 1
        ;;
esac
