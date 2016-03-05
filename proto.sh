#!/bin/bash
set -e
set -o pipefail

# Outputs proto descriptors to proto.js
# Note that this requires modification to protobuf.js:
# all of the regexes must support $ in proto names.
# Maybe we should just use @export or externs here.
node_modules/protobufjs/bin/pbjs src/grid.proto \
  --target json --quiet \
  > dist/proto.json

OUTFILE=dist/proto.js
cat <<EOF > $OUTFILE
goog.provide('windmill.GridProto');

goog.require('goog.object');

goog.scope(function() {
/** @enum {number} */
var Fields = {
EOF

# Mapping from name to number
cat dist/proto.json \
  | grep name \
  | grep -o '[^"]*",' \
  | sed -e 's/..$//' \
  | sort \
  | uniq \
  | awk '{print "  " $0 ": " NR "," }' \
  >> $OUTFILE

# Reverse mapping
cat <<EOF >> $OUTFILE
};
/** @const {map<string, string>} */
var FromFields = goog.object.transpose(Fields);
var proto =
EOF

# JSON with field name derived from reverse mapping
cat dist/proto.json \
  | sed -e 's/\(.*\)"name": "\(.*\)"/\1"name": FromFields[Fields.\2]/' \
        -e 's/\(.*\)"type": "\([A-Z].*\)"/\1"type": FromFields[Fields.\2]/' \
  >> $OUTFILE

cat <<EOF >> $OUTFILE

windmill.GridProto = dcodeIO.ProtoBuf.newBuilder({})['import'](proto).build()['GridProto'];
});
EOF
