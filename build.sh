#!/usr/bin/env bash

npm run build
cp preview.png widget.json README.md dist/

pushd dist && zip -r package.zip . && popd

rm -rf /Users/jinmianye/SiYuan/data/widgets/run-python-code/*
cp -r dist/* /Users/jinmianye/SiYuan/data/widgets/run-python-code/
