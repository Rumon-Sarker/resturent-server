const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');

const stripe = require('stripe')('sk_test_51OWaDGEuuv96ci4xvt0P4L9BcDsX4k6aPKwbBcyRafKqdV1kn8RlOiwpmMhAFXNsVndTcCV6jkpXZnbO4D9ZG2Ah001lg0dWyX')
require("dotenv").config();
const port = process.env.PORT || 5000;

//midleware
app.use(cors());
app.use(express.json());

const veryfyToken = (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorization' });

    }
    const token = authorization.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: "unauthorization access" })
        }
        req.decoded = decoded;
        next()


    })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@expressdb.hgdaj4q.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollaction = client.db('bistroDb').collection('users');
        const menuCollaction = client.db('bistroDb').collection('menu');
        const reviewCollaction = client.db('bistroDb').collection('reviews');
        const cartCollaction = client.db('bistroDb').collection('carts');
        const paymentCollaction = client.db('bistroDb').collection('payments');

        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, { expiresIn: "1h" })
            res.send({ token })

        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollaction.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: this, message: 'Forbiden Message' })
            }
            next()
        }


        app.get("/users", veryfyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollaction.find().toArray();
            res.send(result)
        })


        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollaction.findOne(query);
            if (existingUser) {
                return res.send({ message: "User Already Exists" })
            }
            const result = await usersCollaction.insertOne(user);
            res.send(result)
        })

        app.get("/users/admin/:email", veryfyToken, async (req, res) => {
            const email = req.params.email;
            console.log("simplse email", email)
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }
            const query = { email: email }
            const user = await usersCollaction.findOne(query);

            const result = { admin: user?.role === "admin" };
            console.log("result", result)
            res.send(result)
        })


        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await usersCollaction.updateOne(filter, updateDoc);
            res.send(result)
        })


        app.get("/menu", async (req, res) => {
            const result = await menuCollaction.find().toArray();
            res.send(result)
        })
        app.post("/menu", veryfyToken, verifyAdmin, async (req, res) => {
            const newItem = req.body;
            const result = await menuCollaction.insertOne(newItem);
            res.send(result);
        })
        app.delete("/menu/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollaction.deleteOne(query);
            res.send(result);
        })
        app.get("/review", async (req, res) => {
            const result = await reviewCollaction.find().toArray();
            res.send(result)
        })

        //Cart

        app.get('/carts', veryfyToken, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([]);
            }
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: "forbideen access" })
            }
            const query = { email: email }
            const result = await cartCollaction.find(query).toArray()
            res.send(result)
        })

        app.post("/carts", async (req, res) => {
            const item = req.body;
            const result = await cartCollaction.insertOne(item);
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollaction.deleteOne(query);
            res.send(result)
        })


        //payment System Api 

        app.post('/create-payment-intent', veryfyToken, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })

        });

        app.post('/payments', veryfyToken, async (req, res) => {
            const payment = req.body;
            const result = await paymentCollaction.insertOne(payment);

            const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
            const deleteResult = await cartCollaction.deleteMany(query);


            res.send({ result, deleteResult });
        })

        // Dashboard admin 

        app.get("/admin-stats", veryfyToken, verifyAdmin, async (req, res) => {
            const users = await usersCollaction.estimatedDocumentCount();
            const product = await menuCollaction.estimatedDocumentCount();
            const order = await paymentCollaction.estimatedDocumentCount();

            const payments = await paymentCollaction.find().toArray();
            const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)


            res.send({
                users,
                product,
                order,
                revenue
            })
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Server is Runing')
})

app.listen(port, () => {
    console.log(`Example app listening on port http://localhost:${port}`)
})