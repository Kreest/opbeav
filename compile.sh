#!/bin/bash
set -e
set -o pipefail

C_LIB=node_modules/google-closure-library
C_BIN=node_modules/google-closure-compiler
C_SOY=node_modules/google-closure-templates

OUR_JS_FILES_LIST="
    dist/proto.js
    dist/windmill.soy.js
    src/app.js
    src/constants.js
    src/generate.js
    src/grid.js
    src/grouping.js
    src/keys.js
    src/shape.js
    src/snake.js
    src/solve.js
    src/validate.js
    src/ui.js
    "
EXTERNAL_JS_FILES_LIST="
    $C_LIB/closure/goog
    $C_SOY/javascript/soyutils_usegoog.js
    "
COMPILER_JS_FILES=`ls -d \
    $OUR_JS_FILES_LIST $EXTERNAL_JS_FILES_LIST \
    | sed -e 's/^/--js /'`
# TODO: Add long.js to protobuf.js externs so Closure won't warn.
WINDMILL_EXTERNS=`ls \
    $C_BIN/contrib/externs/angular-1.4.js \
    $C_BIN/contrib/externs/angular-1.4-q_templated.js \
    $C_BIN/contrib/externs/angular-material.js \
    $C_BIN/contrib/externs/angular_ui_router.js \
    node_modules/protobufjs/externs/protobuf.js \
    node_modules/bytebuffer/externs/bytebuffer.js \
    node_modules/long/externs/long.js \
    src/externs.js \
    | sed -e 's/^/--externs /'`

# Need to install bytebuffer. DON'T do this for protobufjs because we have a
# special snowflake version.
if [[ ! -f static/bytebuffer.min.js ]]; then
  cp node_modules/bytebuffer/dist/bytebuffer.min.js static/
fi
if [[ -n $1 ]]; then
  if [[ "$1" == "all" ]]; then
    # TODO: Do all type-setting, then --warning_level VERBOSE.
    # TODO: Move _props_map.out and _vars_map.out somewhere nicer.
    # TODO: Make this take less time by using depslist incrementally.
    java -jar $C_BIN/compiler.jar \
        $COMPILER_JS_FILES $WINDMILL_EXTERNS \
        --closure_entry_point windmill.module \
        --only_closure_dependencies true \
        --process_closure_primitives true \
        --summary_detail_level 3 \
        --angular_pass \
        --create_renaming_reports \
        -O ADVANCED \
        2>&2 > static/code.js
  elif [[ "$1" == "local" ]]; then
    $C_LIB/closure/bin/calcdeps.py \
        -i src/app.js \
        $(ls -d $OUR_JS_FILES_LIST $EXTERNAL_JS_FILES_LIST | grep -v '^src/app.js$' | sed -e 's/^/-p /') \
        -o list \
        > dist/depslist.txt
    {
      echo 'window.CLOSURE_NO_DEPS = true;'
      cat $(grep -Fxv -f <(ls -d $OUR_JS_FILES_LIST) dist/depslist.txt)
    } > dist/base.js
    {
      cat <<EOF
      function __script(a) {
        var s=document.createElement('script');s.async=false;s.src=a;
        document.getElementsByTagName('head')[0].appendChild(s);
      }
EOF
      { echo dist/base.js ; grep -Fx -f <(ls -d $OUR_JS_FILES_LIST) dist/depslist.txt ; } \
        | sed -e 's/\(.*\)/__script("\1")/'
    } > dist/runlocal.js
    exit 0
  fi
fi

# Parse out all scope functions and rename them.
sedcommand=''
for token in `cat src/app.js | grep -o '$scope\.[a-z][a-zA-Z0-9]* = function' | sed -e 's/\$scope.//;s/ = function//' | sort | uniq`; do
  rep=$(grep "^$token:" _props_map.out) || true
  if [[ -n $rep ]]; then
    latter=$(echo $rep | grep -o ':.*')
    sym=${latter:1}
    sedcommand+="s/$token(/$sym(/g;"
  fi
done

# TODO: Don't do html-minifier when developing locally.
for tmpl in `ls src/*.tmpl.html`; do
  cat $tmpl | sed -e $sedcommand | \
      html-minifier --remove-comments --collapse-whitespace --minify-css \
        > static/${tmpl#src/}
done
# Replace our local JS with a single compiled file.
# v= needs to be changed on every push. This might be better done by the
# server.
# Something gives a strange return value here.
set +o pipefail
codev=$(cat /dev/urandom | base64 | tr -cd '[:alpha:]' | head -c 8)
set -o pipefail

cat main.html | sed -e $sedcommand | \
    sed -e "s#dist/runlocal.js#static/code.js?v=${codev}#" | \
    sed -e 's#"static/#"/static/#g' | \
    html-minifier --remove-comments --collapse-whitespace --minify-css \
      > build.html

# Required artifacts
ls build.html static/*js static/*html static/*.svg static/*.ico > /dev/null
date '+%S:%M:%H Done'
# a little preview: hash tag devops
if [[ -d ../server/api/public/static/ ]]; then
  cp build.html static/*js static/*html static/*.svg static/*.ico ../server/api/public/static/
fi

