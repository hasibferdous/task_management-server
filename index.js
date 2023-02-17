const express = require('express')
const dotenv = require('dotenv')
var cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json());
dotenv.config()

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DBV_USER}:${process.env.DB_PASSWORD}@cluster0.f1afyz8.mongodb.net/?retryWrites=true&w=majority`;

async function run() {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
        const userCollection = client.db('taskMaster').collection('users');
        const workspaceCollection = client.db('taskMaster').collection('workspaces');
        const workspaceUsersCollection = client.db('taskMaster').collection('workspace_user');
        const boardsCollection = client.db('taskMaster').collection('boards');
        const tasksCollection = client.db('taskMaster').collection('tasks');
        const commentsCollection = client.db('taskMaster').collection('comments');

        const pricingOptionCollection = client.db('taskMaster').collection('pricingOptions');
        const paymentsCollection = client.db('taskMaster').collection('payments');
        const bookingsCollection = client.db('taskMaster').collection('bookings');


        app.get('/pricingOptions', async (req, res) => {
            const query = {};
            const options = await pricingOptionCollection.find(query).toArray();
            res.send(options);
        })

        app.get('/pricingOptions/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const option = await pricingOptionCollection.findOne(query);
            res.send(option);
        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                email: booking.email,
                price: booking.pricing
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = 'You already have a booking'
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });


        app.post('/create-payment-intent', async (req, res) => {
            const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })


        app.post('/create-update-workspace', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const s = req.body;
            let result = {};
            if (s._id == 'new') {
                delete s._id;
                const day = new Date(Date.now());
                s.created = day;
                const res = await workspaceCollection.insertOne(s);
                if (res.insertedId) {
                    let user = { wid: res.insertedId.toString(), uid: decoded._id, date: day, role: 'admin', invited: false };
                    result = await workspaceUsersCollection.insertOne(user);
                }
            } else {
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: s
                }
                result = await workspaceCollection.updateOne(query, updatedDoc);
            }
            res.send(result);
        });

        app.get('/get-workspaces', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query;
            let wid = [], cursor = [];
            const query2 = { uid: decoded._id }
            const result = await workspaceUsersCollection.find(query2).toArray();
            if (result && result.length > 0) {
                for (let i = 0; i < result.length; i++) {
                    wid[i] = ObjectId(result[i].wid);
                }
                query = { _id: { $in: wid } };
                cursor = await workspaceCollection.find(query).toArray();
            }
            res.send(cursor);
        });

        app.post('/get-workspace-member/:id', verifyJWT, async (req, res) => {
            let uid = [], c = [];
            const id = req.params.id;
            const query2 = { wid: id }
            const result = await workspaceUsersCollection.find(query2).toArray();
            if (result && result.length > 0) {
                for (let i = 0; i < result.length; i++) {
                    uid[i] = ObjectId(result[i].uid);
                }
                const query = { _id: { $in: uid } };
                const cursor = userCollection.find(query)
                c = await cursor.toArray();
            }
            res.send(c);
        });

        app.post('/create-update-workspace-board', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const s = req.body;

            let result;
            if (s._id == 'new') {
                delete s._id;
                const day = new Date(Date.now());
                s.created = day;
                result = await boardsCollection.insertOne(s);
            } else {
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: s
                }
                result = await boardsCollection.updateOne(query, updatedDoc);
            }
            res.send(result);
        });

        //get all board by id
        app.get('/workspace-boards/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { wid: id };
            const result = await boardsCollection.find(query).toArray();
            res.send(result);
        })

        //get single board
        app.get('/board/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await boardsCollection.findOne(query);
            res.send(result);
        })

        app.post('/create-update-task', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const s = req.body;

            let result;
            if (s._id == 'new') {
                delete s._id;
                const day = new Date(Date.now());
                s.created = day;
                result = await tasksCollection.insertOne(s);
            } else {
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: s
                }
                result = await tasksCollection.updateOne(query, updatedDoc);
            }
            res.send(result);
        });

        app.post('/create-update-comments', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const s = req.body;

            let result;
            if (s._id == 'new') {
                delete s._id;
                const day = new Date(Date.now());
                s.created = day;
                s.uid = decoded._id;
                result = await commentsCollection.insertOne(s);
            } else {
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: s
                }
                result = await commentsCollection.updateOne(query, updatedDoc);
            }
            res.send(result);
        });
        //get comments by task id
        app.get('/comments/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { taskId: id };
            const result = await commentsCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/board/get_task_list/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { boradId: id };
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/invite-workspace-member', verifyJWT, async (req, res) => {
            const s = req.body;
            const email = s.email;
            const query = { email: email };
            let user = await userCollection.findOne(query);
            if (!user) {
                return res.send({ message: 'User not found.' });
            }

            const query2 = { uid: user._id, wid: s.wid };
            let exist = await workspaceUsersCollection.findOne(query2);
            if (!exist) {
                const day = new Date(Date.now());
                let user2 = { wid: s.wid, uid: user._id.toString(), date: day, role: 'admin', invited: true };
                let result2 = await workspaceUsersCollection.insertOne(user2);
            }
            return res.send({ message: 'Successfully sent.' });
        });


        app.post('/jwtANDusers', async (req, res) => {
            const u = req.body;
            const query = { email: u.email };
            let user = await userCollection.findOne(query);
            if (!user && u?.insert) {
                delete u.insert;
                let status = await userCollection.insertOne(u);
                user = await userCollection.findOne(query);
            }
            if (user) {
                let token = jwt.sign({ email: user.email, _id: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
                let role = user.role;
                return res.send({ token, role });
            }
            res.send({})

        });

        app.post('/getRole', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            const c = await userCollection.findOne(query)
            res.send({ role: c?.role });
        });

        app.get('/allDatas', verifyJWT, async (req, res) => {
            const query = {  };
            const task =await  tasksCollection.find(query).toArray();
            const board =await  boardsCollection.find(query).toArray();
            const user =await  userCollection.find(query).toArray();
            const workspace =await  workspaceCollection.find(query).toArray();
            res.send([user, board, task, workspace,])
        });

        app.delete('/delete/:id',verifyJWT,  async (req,res)=>{
            const id = req.params.id;
            const filter = {_id : ObjectId(id)};
            const result = await userCollection.deleteOne(filter);
           
            res.send(result);
      
          });

           app.get('/updateprofile', async (req,res)=>{
            const email = req.query.email;
            const query = {email:email};
            const result = await userCollection.findOne(query);
           
            res.send(result);

         });

         app.put('/update/:email', async (req,res)=>{
            const updates = req.body;
           const filter = {email:updates.email}
           
            const options = {upsert: true};
            const updateddoc = {
                $set:{
                 name:updates.name,
                 workplace:updates.workplace,
                 univerty:updates.univerty,
                 address:updates.address,
                 come:updates.come,
                 relationship:updates.relationship,
                
                
                }
            }
            const result = await userCollection.updateMany(filter,updateddoc,options);
            res.send(result);
         });

    }
    finally {

    }

}

app.get('/', (req, res) => {
    res.send('Server created for taskMaster')
})

run().catch(err => console.error(err));

app.listen(port, () => {
    console.log(`taskMaster server app listening on port ${port}`)
})