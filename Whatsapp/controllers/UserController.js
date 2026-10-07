// controllers/UserController.js

const Customer = require("../models/Customer");

class UserController {

    // ============================
    // POST /api/whatsapp/users
    // Create / register a user manually
    // ============================

    async createUser(req, res) {

        try {

            const { name, phone, category } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Customer Name is required."
                });
            }

            if (!phone || !phone.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Mobile Number is required."
                });
            }

            const mobileNumber = phone.trim();
            const customerName = name.trim();

            // Check if user already exists
            const existingCustomer = await Customer.findOne({ mobileNumber });
            if (existingCustomer) {
                return res.status(409).json({
                    success: false,
                    message: `Customer with mobile number ${mobileNumber} already exists.`
                });
            }

            const customerId = `CUST-${mobileNumber}`;

            const customer = new Customer({
                customerName,
                mobileNumber,
                customerId,
                category: category || "Customer"
            });

            await customer.save();

            return res.status(201).json({
                success: true,
                message: "User added successfully!",
                customer
            });

        } catch (error) {

            console.error("Create User Error:", error.message);

            return res.status(500).json({
                success: false,
                message: error.message
            });

        }

    }

    // ============================
    // GET /api/whatsapp/users
    // List all registered customers/users
    // ============================

    async getUsers(req, res) {

        try {

            const customers = await Customer.find().sort({ createdAt: -1 }).lean();

            return res.status(200).json({
                success: true,
                count: customers.length,
                users: customers
            });

        } catch (error) {

            console.error("Get Users Error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch users."
            });

        }

    }

    // ============================
    // POST /api/whatsapp/users/upload
    // Bulk upload users via CSV text parse
    // ============================

    async uploadUsers(req, res) {

        try {

            const { csvText } = req.body;

            if (!csvText || !csvText.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "CSV text is required."
                });
            }

            const lines = csvText.split("\n");
            const added = [];
            const skipped = [];

            // Skip header line if present
            const startIndex = lines[0].toLowerCase().includes("number") || lines[0].toLowerCase().includes("name") ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Split by comma
                const parts = line.split(",");
                const phone = parts[0]?.trim();
                const name = parts[1]?.trim() || `User-${phone}`;
                const category = parts[2]?.trim() || "Customer";

                if (!phone || !/^\+?[1-9]\d{1,14}$/.test(phone)) {
                    skipped.push({ phone, reason: "Invalid format" });
                    continue;
                }

                // Check duplicate
                const exists = await Customer.findOne({ mobileNumber: phone });
                if (exists) {
                    skipped.push({ phone, reason: "Duplicate number" });
                    continue;
                }

                const customerId = `CUST-${phone}`;
                const customer = new Customer({
                    customerName: name,
                    mobileNumber: phone,
                    customerId,
                    category
                });

                await customer.save();
                added.push(customer);
            }

            return res.status(200).json({
                success: true,
                message: "Bulk file processed successfully.",
                summary: {
                    totalParsed: lines.length - startIndex,
                    successCount: added.length,
                    failedCount: skipped.length,
                    added,
                    skipped
                }
            });

        } catch (error) {

            console.error("Bulk Upload Error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to process bulk upload."
            });

        }

    }

}

module.exports = new UserController();
