const mongoose = require("mongoose");

const MenuPermissionSchema = new mongoose.Schema({

    employeeId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Employee",
        required:true,
        unique:true
    },

    isApprover:{
        type:Boolean,
        default:false
    },

    menus:[

        {
            module:{
                type:String,
                enum:[
                    "Access Controller",
                    "Payment Script",
                    "Inscope Vendor"
                ]
            },

            permission:{
                type:String,
                enum:[
                    "NO_ACCESS",
                    "READ",
                    "WRITE",
                    "BOTH"
                ],
                default:"NO_ACCESS"
            }
        }

    ]

},{timestamps:true});

module.exports = mongoose.model(
"MenuPermission",
MenuPermissionSchema
);
