import express from 'express';
const app = express();
const port = process.env.PORT || 3001;
import fs from 'fs';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { YoutubeTranscript } from 'youtube-transcript';
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { PineconeStore } from "langchain/vectorstores/pinecone"
import { OpenAIEmbeddings } from "langchain/embeddings/openai"
import { PineconeClient } from "@pinecone-database/pinecone"
import { OpenAI } from "langchain/llms/openai"
import { loadQAStuffChain } from "langchain/chains"
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
const GOOGLE_CLIENT_ID = '767718505902-7b32jg7e5q7g7j3qumh9g0912r13cqtn.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const PINECONE_API_KEY = process.env.PINECONE_KEY;
const PINECONE_API_ENV = "northamerica-northeast1-gcp";
const openaiApiKey = process.env.API_KEY;
import { connectDB, User } from './db/conn.js';
import session from 'express-session';
import CryptoJS from 'crypto-js';
import nodemailer from 'nodemailer';
const cryptsecret_key = "Shahil"
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

connectDB();

app.use(express.json());
app.set('views', 'src');
app.set('view engine', 'hbs');
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(cors({
    origin: 'http://localhost:3000', // Replace with the domain of your React app
    credentials: true, // Allow sending cookies with the request
}));
mongoose.set('strictQuery', false);
app.use(session({
    secret: 'Shahil',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'shahilverma91383@gmail.com',
        pass: 'kcbbgtqzomtgjryl'
    }
});



const videoUrl = 'https://www.youtube.com/watch?v=ry9SYnV3svc';
const query = "What do you like about the company you're working for?";


passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then((user) => {
            done(null, user);
        })
        .catch((error) => {
            done(error, null);
        });
});

passport.use(
    new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback'
        // It is redirect url.
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const existingUser = await User.findOne({ googleId: profile.id });
            if (existingUser) {
                console.log('User is already registered.');
                done(null, existingUser);
            } else {
                const newUser = await new User({ googleId: profile.id, name: profile.displayName, email: profile.emails[0].value, imgsrc: profile.photos[0].value, credits: 50 }).save();
                console.log('User registered successfully');
                done(null, newUser);
            }
        } catch (error) {
            console.error('Error saving the user', error);
        }
    })
);

app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}))

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const userData = req.user;
    req.session.userData = userData;
    console.log(req.session.userData);
    req.session.save(() => {
        res.redirect(`http://localhost:3000/`);
    });
});


app.get('/logout', (req, res) => {
    req.logout(() => {
        res.send(req.user);
    });
})


app.post('/signup', async (req, res) => {
    const formData = req.body;
    console.log(formData)
    const existingUser = await User.findOne({ email: formData.email });
    if (existingUser) {
        res.status(200).json({ redirectUrl: 'http://localhost:3000/signin' });
    } else {
        const encryptedData = CryptoJS.AES.encrypt(JSON.stringify(formData), cryptsecret_key).toString();
        const redirectUrl = `http://localhost:3000/createprofile?data=${encodeURIComponent(encryptedData)}`;
        res.status(200).json({ redirectUrl });
    }
})

app.post('/profile', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const response = await fetch("https://picsum.photos/100/100");
        const newUser = await new User({ name: name, email: email, imgsrc: response.url }).save();
        console.log('User registered successfully');
        req.session.userData = newUser;
        req.session.save((error) => {
            if (error) {
                console.log('Error saving session: ', error);
            } else {
                res.redirect("http://localhost:3000");
            }
        });
    } catch (error) {
        console.log('Error registering user:', error);
        res.status(500).json({ error: 'User registration failed' });
    }

})

app.get('/userdata', (req, res) => {
    const userData = req.session.userData;
    if (userData) {
        res.json(userData);
    } else {
        res.status(404).json({ error: 'User data not found' });
    }
});

app.post('/contact', (req, res) => {
    const formData = req.body;
    const mailOptions = {
        from: 'shahilverma91383@gmail.com',
        to: 'shahil9728196648@gmail.com',
        subject: 'New contact form submission',
        html: `
          <h1>Contact Details</h1>
          <p>Name: ${formData.name}</p>
          <p>Phone: ${formData.phone}</p>
          <p>Email: ${formData.email}</p>
          <p>Message: ${formData.message}</p>
        `
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.send('Email sent successfully');
        }
    });
})

const storembedding = async (textFile) => {
    try {
        const loader = new TextLoader(textFile);
        const documents = await loader.load();
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunk_size: 1000,
            chunk_overlap: 10,
        });
        const texts = await textSplitter.splitDocuments(documents);
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: openaiApiKey,
        });
        const client = new PineconeClient();
        await client.init({
            environment: PINECONE_API_ENV,
            apiKey: PINECONE_API_KEY,
        });
        const index_name = process.env.INDEX_NAME;
        const pineconeIndex = client.Index(index_name);
        console.log("Before from Documents");
        await PineconeStore.fromDocuments(texts, embeddings, {
            pineconeIndex,
            namespace: "Fourth",
        });
        console.log("Embeddings saved")
        return "Suucessfully saved embeddings";
    } catch (error) {
        console.log(error)
        return "error";
    }
}

const fetchquery = async (que) => {
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
    });
    const client = new PineconeClient();
    await client.init({
        environment: PINECONE_API_ENV,
        apiKey: PINECONE_API_KEY,
    });
    const index_name = process.env.INDEX_NAME;
    const pineconeIndex = client.Index(index_name);
    const docSearch = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
    });
    const query = que || "How is your new job going ?";
    const searchResults = await docSearch.similaritySearch(query, 5);
    const llm = new OpenAI({
        temperature: 0.7,
        openAIApiKey: openaiApiKey,
    });
    const chain = loadQAStuffChain(llm);
    const responseAns = await chain.call({
        input_documents: searchResults,
        question: query,
    });
    return responseAns.text
}

async function run(videoUrl, query) {
    try {
        await transcribeAudio(videoUrl);
        console.log("Fetching query");
        const store = await storembedding('transcript.txt');
        console.log(store);
        const data = await fetchquery(query);
        return data;
    } catch (error) {
        console.log("Error occurred: ", error);
    }
}

app.post('/api', async (req, res) => {
    const videoUrl = req.body.link;
    const query = req.body.query;
    const answer = await run(videoUrl, query);
    console.log(answer)
    const correctans = answer;
    res.json({ correctans });
})


app.get('/', async (req, res) => {
    res.render('index.hbs');
})



// Download the youtube video and get the audio and then convert the audio into text and save transcript in the file
async function transcribeAudio(videoUrl) {
    try {
        const res = await YoutubeTranscript.fetchTranscript(videoUrl);
        const data1 = [];
        const data = res.map((r) => {
            data1.push(r.text);
        });
        console.log("Transcription Fetched");
        const res1 = await storeTranscription(data1.join(' '));
    } catch (error) {
        console.log("Error while fetching transcription data: ", error);
        return;
    }
}

async function storeTranscription(transcription) {
    try {
        fs.writeFileSync('transcript.txt', transcription);
        console.log('File created and transcript written successfully!');
    } catch (error) {
        console.error('Error writing file:', error);
        return;
    }
    try {
        // connect to the database
        const client = await mongoose.connect(process.env.MONGO_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Database connection is Successful");
        const transcriptionSchema = new mongoose.Schema({
            text: String
        });
        const Transcription = mongoose.model('transcription', transcriptionSchema);
        const existingTranscription = await Transcription.findOne({ text: transcription });
        if (existingTranscription) {
            console.log('Transcription data already exists in the database.');
        } else {
            const transcriptionData = new Transcription({
                text: transcription
            });
            await transcriptionData.save();
            console.log('Transcription data saved successfully in the database!');
        }
    } catch (error) {
        console.error('Error saving transcription data:', error);
    } finally {
        mongoose.connection.close();
    }
}

app.listen(port, (req, res) => {
    console.log(`Server is running at ${port}`);
})