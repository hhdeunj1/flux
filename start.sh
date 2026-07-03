#!/bin/bash
export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd /Users/hmc/flux
nohup /opt/homebrew/bin/npm run dev > /tmp/flux.log 2>&1 &
