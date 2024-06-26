const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();

//middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://hexa-4494c.web.app']
}));
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qemc4ul.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        // await client.connect();

        //Collections
        const userCollection = client.db('hexa').collection('users');
        const blogCollection = client.db('hexa').collection('blog');

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        //my middleware
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                // console.log("No token");
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            // console.log('got the token', token);
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }



        // user related api
        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/allUsers', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;

            // if (email !== req.decoded.email) {
            //     return res.status(403).send({ message: 'forbidden access' })
            // }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        //blog related api

        app.get('/blogs', async (req, res) => {
            // console.log(req.query.email);
            let query = {};
            if (req.query?.email) {
                query = { email: req.query.email }
            }
            const result = await blogCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogCollection.findOne(query);
            res.send(result);
        })

        app.post('/blogs', async (req, res) => {
            const blog = req.body;
            // console.log(blog);
            const result = await blogCollection.insertOne(blog);
            res.send(result);
        });

        app.put('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const blog = req.body;
            // console.log(id, blog);
            const filter = { _id: new ObjectId(id) }
            const option = { upsert: true }
            const updateBlog = {
                $set: {
                    title: blog.title,
                    description: blog.description,
                    updateTime: blog.updateTime
                },
                $unset: {
                    dateTime: 1
                }
            }
            const result = await blogCollection.updateOne(filter, updateBlog, option);
            res.send(result)
        })


        app.delete('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await blogCollection.deleteOne(query);
            res.send(result);
        })
        app.delete('/allBlogs/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await blogCollection.deleteOne(query);
            res.send(result);
        })

        // Vote (upvote or downvote) for a blog
        app.put('/upVote/:id', async (req, res) => {
            const id = req.params.id;
            const blog = req.body;
            // console.log(id, blog);
            const filter = { _id: new ObjectId(id) }
            const blogData = await blogCollection.findOne(filter);
            const updateBlog = {};
            const option = { upsert: true };
            // Remove email from downVote array if present
            if (blogData.downVote && blogData.downVote.some(vote => vote.email === blog.email)) {
                updateBlog.$pull = { downVote: { email: blog.email } };
            }
            // Add email to upVote array
            updateBlog.$addToSet = { upVote: { email: blog.email } };
            const result = await blogCollection.updateOne(filter, updateBlog, option);
            res.send(result)
        })
        app.put('/downVote/:id', async (req, res) => {
            const id = req.params.id;
            const blog = req.body;
            // console.log(id, blog);
            const filter = { _id: new ObjectId(id) }
            const blogData = await blogCollection.findOne(filter);
            const updateBlog = {};
            const option = { upsert: true };
            if (blogData.upVote && blogData.upVote.some(vote => vote.email === blog.email)) {
                updateBlog.$pull = { upVote: { email: blog.email } };
            }
            // Add email to downVote array
            updateBlog.$addToSet = { downVote: { email: blog.email } };
            const result = await blogCollection.updateOne(filter, updateBlog, option);
            res.send(result)
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

// app.get('/', (req, res) => {
//     res.send(`
//     <h1 style="text-align:center;font-family:Monospace;">Hexa Server Is Running...</h1>
//     <h2 style="text-align:center;font-family:Monospace;"><a href='http://localhost:5000/users'>users</a></h2>
//     <h2 style="text-align:center;font-family:Monospace;"><a href='http://localhost:5000/blogs'>blogs</a></h2>`)
// })
app.get('/', (req, res) => {
    res.send(`
    <h1 style="text-align:center;font-family:Monospace;">Hexa Server Is Running...</h1>
    <h2 style="text-align:center;font-family:Monospace;"><a href='https://hexa-server.vercel.app/users'>users</a></h2>
    <h2 style="text-align:center;font-family:Monospace;"><a href='https://hexa-server.vercel.app/blogs'>blogs</a></h2>`)
})

app.listen(port, () => {
    console.log(`Hexa Is Running On Port: ${port}`)
})