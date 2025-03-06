#!/usr/bin/env bash

npm run build
cp preview.png widget.json README.md dist/

pushd dist && zip -r package.zip . && popd
