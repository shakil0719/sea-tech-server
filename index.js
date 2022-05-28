const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const res = require("express/lib/response");
const query = require("express/lib/middleware/query");

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

//mongoConnect

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cdxfa.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Token" });
    }
    req.decoded = decoded;

    next();
  });
}

async function run() {
  try {
    await client.connect();

    //database
    const productCollection = client.db("sea_tech").collection("products");
    const userCollection = client.db("sea_tech").collection("users");
    const reviewCollection = client.db("sea_tech").collection("reviews");
    const orderCollection = client.db("sea_tech").collection("orders");

    ////////
    const verifyAdmin = async (req, res, next) => {
      const requester = req?.decoded?.email;

      const requesterAccount = await userCollection?.findOne({
        email: requester,
      });

      if (requesterAccount?.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    };
    app.put("/users/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);

      res.send(result);
    });
    app.delete(
      "/users/admin/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };

        const result = await userCollection.findOne(filter);

        if (result.role === "admin") {
          res.send({ success: false });
        } else {
          const userDelete = await userCollection.deleteOne(filter);
          res.send({ success: true });
        }
      }
    );

    app.get("/homeReview", async (req, res) => {
      const query = {};
      const count = await reviewCollection.estimatedDocumentCount();

      const top6 = count - 6;
      const result = await reviewCollection.find(query).skip(top6).toArray();
      const resReverse = result.reverse();

      // console.log(result);
      res.send(result);
    });
    app.get("/review", async (req, res) => {
      const query = {};

      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/review", verifyJWT, async (req, res) => {
      const body = req.body;

      req.body.rating = parseFloat(body.rating);

      const result = await reviewCollection.insertOne(body);
      res.send(result);
    });
    app.get("/user", verifyJWT, async (req, res) => {
      const query = { email: req?.query?.email };
      const result = await userCollection.findOne(query);

      res.send(result);
    });
    app.get("/allUser", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const result = await userCollection?.find(query)?.toArray();

      res.send(result);
    });
    app.put("/user", verifyJWT, async (req, res) => {
      const filter = { email: req.query.email };

      const auth = req.body;
      const options = { upsert: true };

      const updateDoc = {
        $set: auth,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);

      res.send(result);
    });

    app.get("/products", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });
    app.get("/adminProducts", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });
    app.get("/admin/:email", async (req, res) => {
      const email = req?.params?.email;
      const user = await userCollection?.findOne({ email: email });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
    });
    app.get("/product", verifyJWT, async (req, res) => {
      const id = req.query;

      const query = { _id: ObjectId(id) };

      const result = await productCollection.findOne(query);
      res.send(result);
    });
    app.delete("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query._id;
      console.log(id);

      const query = { _id: ObjectId(id) };

      const result = await productCollection.deleteOne(query);
      console.log(result);
      res.send(result);
    });

    //signUp or Login
    app.put("/user/:email", async (req, res) => {
      const email = req?.params?.email;
      const filter = { email: email };
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1d",
      });
      const user = req.body;
      const option = { upsert: true };
      let result;

      const updateDoc = { $set: user };
      result = await userCollection.updateOne(filter, updateDoc, option);

      res.send({ result, token });
    });

    //add product

    app.post("/addProduct", verifyJWT, verifyAdmin, async (req, res) => {
      const product = req?.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });
    app.post("/order", verifyJWT, async (req, res) => {
      const order = req?.body;

      const result = await orderCollection.insertOne(order);

      res.send({ success: true });
    });
    app.put("/orderUpdate", verifyJWT, async (req, res) => {
      const order = req?.body;

      console.log(order);

      const filter = { _id: ObjectId(order._id) };
      console.log(filter);

      const updateDoc = {
        $set: { transactionId: order.transactionId, status: "pending" },
      };

      const result = await orderCollection.updateOne(filter, updateDoc);

      res.send({ success: true });
    });
    app.get("/myOrder", verifyJWT, async (req, res) => {
      const email = req?.query;
      console.log(email);
      const query = email;

      const result = await orderCollection.find(query).toArray();
      console.log(result);

      res.send(result);
    });
    app.get("/allOrder", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await orderCollection.find().toArray();

      res.send(result);
    });
    app.get("/available", verifyJWT, verifyAdmin, async (req, res) => {
      const { product_id } = req.query;
      // console.log(product_id);
      const query = { _id: ObjectId(product_id) };
      console.log(query);
      const result = await productCollection.find(query).toArray();

      res.send(result);
    });
    app.put("/update", verifyJWT, verifyAdmin, async (req, res) => {
      const { product_id, _id, orderAmount } = req.query;
      console.log(product_id);
      console.log(_id);
      console.log(orderAmount);
      const query1 = { _id: ObjectId(product_id) };
      const query2 = { _id: ObjectId(_id) };

      const available = await productCollection.findOne(query1);

      const availableAmount = available.availableQuantity;
      const newQuantity = Number(availableAmount) - Number(orderAmount);
      console.log(newQuantity);

      const updateDoc = {
        $set: { availableQuantity: newQuantity },
      };
      const result = await productCollection.updateOne(query1, updateDoc);
      const updateDoc2 = {
        $set: { status: "delivered" },
      };
      const result2 = await orderCollection.updateOne(query2, updateDoc2);

      let final = false;

      if (result && result2) {
        final = true;
      }

      // console.log(query);
      // const result = await productCollection.find(query).toArray();

      res.send({ success: final });
    });

    //payment
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;

      const price = Number(service.paymentAmount);

      const amount = price * 1;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hellow");
});

app.listen(port, () => {
  console.log("Listening to server");
});
