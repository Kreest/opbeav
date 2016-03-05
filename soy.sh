#!/bin/bash
set -e
set -o pipefail

{
# Parse out all of the proto enums into globals
enum=0
while read line; do
  if [[ "$line" =~ enum\ (.*)\ \{ ]]; then
    enum="${BASH_REMATCH[1]}";
  elif [[ "$line" =~ ^([A-Z_]*)\ =\ (.*)\;$ ]]; then
    echo "$enum.${BASH_REMATCH[1]} = ${BASH_REMATCH[2]}";
  fi
done <src/grid.proto
} > dist/soyglobals.txt

# And also add our UI constants file
cat src/constants.js | grep 'UI\.[A-Z]' >> dist/soyglobals.txt

SOY=node_modules/google-closure-templates
java -jar $SOY/javascript/SoyToJsSrcCompiler.jar \
  --compileTimeGlobalsFile dist/soyglobals.txt \
  --shouldGenerateJsdoc \
  --shouldProvideRequireSoyNamespaces \
  --outputPathFormat 'dist/{INPUT_FILE_NAME_NO_EXT}.soy.js' src/windmill.soy 2>&1 | tee dist/soyerrors

if [[ "$1" == static ]]; then
  # We do transitively use Guava here btw.
  JCP=$SOY/java/Soy.jar
  javac -cp $JCP src/WriteSvg.java -d dist
  java -cp dist:$JCP WriteSvg | tee -a dist/soyerrors
fi

if command -v notify-send > /dev/null; then
  if [[ -s dist/soyerrors ]]; then
    notify-send -t 2000 "$(head -n 1 dist/soyerrors | sed -e 's/.*windmill.soy\(:\|, \)//')"
  else
    notify-send -t 2000 "Success"
  fi
fi

