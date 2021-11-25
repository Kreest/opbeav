goog.provide('windmill.GridProto');

goog.require('goog.object');

goog.scope(function() {
/** @enum {number} */
var Fields = {
  BASIC: 1,
  BLACK: 2,
  BLUE: 3,
  CELL: 4,
  color: 5,
  Color: 6,
  count: 7,
  CYAN: 8,
  DISJOINT: 9,
  DrawType: 10,
  END: 11,
  entity: 12,
  Entity: 13,
  ERROR: 14,
  free: 15,
  GREEN: 16,
  grid: 17,
  HEXAGON: 18,
  HLINE: 19,
  horizontal: 20,
  HORIZONTAL: 21,
  MAGENTA: 22,
  MIDDLE: 23,
  negative: 24,
  NONE: 25,
  ORANGE: 26,
  orientation: 27,
  Orientation: 28,
  POINT: 29,
  RED: 30,
  ROTATIONAL: 31,
  SegmentType: 32,
  shape: 33,
  Shape: 34,
  SQUARE: 35,
  STAR: 36,
  START: 37,
  Storage: 38,
  symmetry: 39,
  SymmetryType: 40,
  TETRIS: 41,
  TRIANGLE: 42,
  triangle_count: 43,
  type: 44,
  Type: 45,
  UNKNOWN: 46,
  vertical: 47,
  VERTICAL: 48,
  VLINE: 49,
  WHITE: 50,
  width: 51,
  YELLOW: 52,
};
/** @const {map<string, string>} */
var FromFields = goog.object.transpose(Fields);
var proto =
{
    "package": "GridProto",
    "messages": [
        {
            "name": FromFields[Fields.Entity],
            "fields": [
                {
                    "rule": "optional",
                    "type": FromFields[Fields.Type],
                    "name": FromFields[Fields.type],
                    "id": 1
                },
                {
                    "rule": "optional",
                    "type": FromFields[Fields.Color],
                    "name": FromFields[Fields.color],
                    "id": 2
                },
                {
                    "rule": "optional",
                    "type": FromFields[Fields.Orientation],
                    "name": FromFields[Fields.orientation],
                    "id": 3
                },
                {
                    "rule": "optional",
                    "type": FromFields[Fields.Shape],
                    "name": FromFields[Fields.shape],
                    "id": 4
                },
                {
                    "rule": "optional",
                    "type": "int32",
                    "name": FromFields[Fields.count],
                    "id": 5
                },
                {
                    "rule": "optional",
                    "type": "int32",
                    "name": FromFields[Fields.triangle_count],
                    "id": 6
                }
            ]
        },
        {
            "name": FromFields[Fields.Shape],
            "fields": [
                {
                    "rule": "optional",
                    "type": "int32",
                    "name": FromFields[Fields.width],
                    "id": 1
                },
                {
                    "rule": "repeated",
                    "type": "bool",
                    "name": FromFields[Fields.grid],
                    "id": 2,
                    "options": {
                        "packed": true
                    }
                },
                {
                    "rule": "optional",
                    "type": "bool",
                    "name": FromFields[Fields.free],
                    "id": 3
                },
                {
                    "rule": "optional",
                    "type": "bool",
                    "name": FromFields[Fields.negative],
                    "id": 4
                }
            ]
        },
        {
            "name": FromFields[Fields.Orientation],
            "fields": [
                {
                    "rule": "optional",
                    "type": "sint32",
                    "name": FromFields[Fields.horizontal],
                    "id": 1
                },
                {
                    "rule": "optional",
                    "type": "sint32",
                    "name": FromFields[Fields.vertical],
                    "id": 2
                }
            ]
        },
        {
            "name": FromFields[Fields.Storage],
            "fields": [
                {
                    "rule": "optional",
                    "type": "int32",
                    "name": FromFields[Fields.width],
                    "id": 1
                },
                {
                    "rule": "repeated",
                    "type": FromFields[Fields.Entity],
                    "name": FromFields[Fields.entity],
                    "id": 2
                },
                {
                    "rule": "optional",
                    "type": FromFields[Fields.SymmetryType],
                    "name": FromFields[Fields.symmetry],
                    "id": 3
                }
            ]
        }
    ],
    "enums": [
        {
            "name": FromFields[Fields.Type],
            "values": [
                {
                    "name": FromFields[Fields.UNKNOWN],
                    "id": 0
                },
                {
                    "name": FromFields[Fields.NONE],
                    "id": 1
                },
                {
                    "name": FromFields[Fields.BASIC],
                    "id": 2
                },
                {
                    "name": FromFields[Fields.START],
                    "id": 3
                },
                {
                    "name": FromFields[Fields.END],
                    "id": 4
                },
                {
                    "name": FromFields[Fields.DISJOINT],
                    "id": 5
                },
                {
                    "name": FromFields[Fields.HEXAGON],
                    "id": 6
                },
                {
                    "name": FromFields[Fields.SQUARE],
                    "id": 7
                },
                {
                    "name": FromFields[Fields.STAR],
                    "id": 8
                },
                {
                    "name": FromFields[Fields.TETRIS],
                    "id": 9
                },
                {
                    "name": FromFields[Fields.ERROR],
                    "id": 10
                },
                {
                    "name": FromFields[Fields.TRIANGLE],
                    "id": 11
                }
            ]
        },
        {
            "name": FromFields[Fields.Color],
            "values": [
                {
                    "name": FromFields[Fields.UNKNOWN],
                    "id": 0
                },
                {
                    "name": FromFields[Fields.BLACK],
                    "id": 1
                },
                {
                    "name": FromFields[Fields.WHITE],
                    "id": 2
                },
                {
                    "name": FromFields[Fields.CYAN],
                    "id": 3
                },
                {
                    "name": FromFields[Fields.MAGENTA],
                    "id": 4
                },
                {
                    "name": FromFields[Fields.YELLOW],
                    "id": 5
                },
                {
                    "name": FromFields[Fields.RED],
                    "id": 6
                },
                {
                    "name": FromFields[Fields.GREEN],
                    "id": 7
                },
                {
                    "name": FromFields[Fields.BLUE],
                    "id": 8
                },
                {
                    "name": FromFields[Fields.ORANGE],
                    "id": 9
                }
            ]
        },
        {
            "name": FromFields[Fields.SymmetryType],
            "values": [
                {
                    "name": FromFields[Fields.UNKNOWN],
                    "id": 0
                },
                {
                    "name": FromFields[Fields.NONE],
                    "id": 1
                },
                {
                    "name": FromFields[Fields.HORIZONTAL],
                    "id": 2
                },
                {
                    "name": FromFields[Fields.VERTICAL],
                    "id": 3
                },
                {
                    "name": FromFields[Fields.ROTATIONAL],
                    "id": 4
                }
            ]
        },
        {
            "name": FromFields[Fields.DrawType],
            "values": [
                {
                    "name": FromFields[Fields.UNKNOWN],
                    "id": 0
                },
                {
                    "name": FromFields[Fields.CELL],
                    "id": 1
                },
                {
                    "name": FromFields[Fields.POINT],
                    "id": 2
                },
                {
                    "name": FromFields[Fields.HLINE],
                    "id": 3
                },
                {
                    "name": FromFields[Fields.VLINE],
                    "id": 4
                }
            ]
        },
        {
            "name": FromFields[Fields.SegmentType],
            "values": [
                {
                    "name": FromFields[Fields.UNKNOWN],
                    "id": 0
                },
                {
                    "name": FromFields[Fields.START],
                    "id": 1
                },
                {
                    "name": FromFields[Fields.MIDDLE],
                    "id": 2
                },
                {
                    "name": FromFields[Fields.END],
                    "id": 3
                }
            ]
        }
    ]
}
windmill.GridProto = dcodeIO.ProtoBuf.newBuilder({})['import'](proto).build()['GridProto'];
});
