#!/bin/bash

# Read credentials from .env.local
if [ -f "$(dirname "$0")/../.env.local" ]; then
    source "$(dirname "$0")/../.env.local"
fi

# Only proceed if we're the correct user
if [ "$GIT_USERNAME" != "tripleh1701-dev" ]; then
    echo "Error: Unauthorized user. Only tripleh1701-dev is allowed." >&2
    exit 1
fi

# For username prompt
if [[ "$1" == *"Username"* ]]; then
    echo "$GIT_USERNAME"
# For password/token prompt  
elif [[ "$1" == *"Password"* ]] || [[ "$1" == *"password"* ]]; then
    echo "$GIT_PAT"
else
    echo "$GIT_PAT"
fi
