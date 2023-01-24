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


const uri = `mongodb+srv://${process.env.DBV_USER}:${process.env.DB_PASSWORD}@cluster0.yzlpmea.mongodb.net/?retryWrites=true&w=majority`;

async function run() {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
        const userCollection = client.db('taskMaster').collection('users');
        const workspaceCollection = client.db('taskMaster').collection('workspaces');
        const boardsCollection = client.db('taskMaster').collection('boards');

        app.post('/create-update-workspace', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const s = req.body;
            let result;
            if (s._id == 'new') {
                delete s._id;
                const day = new Date(Date.now());
                s.created = day;
                s.users = [
                    { uid: decoded._id, date: day, role: 'admin', invited: false }
                ];
                result = await workspaceCollection.insertOne(s);
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
            let query = { "users.uid": decoded._id };
            const cursor = await workspaceCollection.find(query).sort({ created: -1 }, function (err, cursor) { }).toArray();
            res.send(cursor);
        });

        app.post('/get-workspace-member', verifyJWT, async (req, res) => {
            const uid = req.body;
            for (let i = 0; i < uid.length; i++) {
                uid[i] = ObjectId(uid[i]);
            }
            const query = { _id: { $in: uid } };
            const cursor = userCollection.find(query)
            const c = await cursor.toArray();
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
                const options = {upsert: true};
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: { name:s.name}
                }
                result = await boardsCollection.updateOne(query, updatedDoc,options);

            }
            res.send(result);
        });

        app.get('/workspace-boards/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { wid: id };
            const result = await boardsCollection.find(query).toArray();
            res.send(result);
        })

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
            res.send({ role: c.role });
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