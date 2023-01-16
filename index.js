const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const app = express();
//middleware
app.use(cors());0
app.use(express.json());
app.get('/', async(req, res)=>{
    res.send('task management server is running');
})
app.listen(port, ()=> console.log(`taskMaster is running on ${port}`))
