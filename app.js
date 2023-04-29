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
const PINECONE_API_KEY = process.env.PINECONE_KEY;
const PINECONE_API_ENV = "northamerica-northeast1-gcp";
const openaiApiKey = process.env.API_KEY;


app.use(express.json());
app.set('views', 'src');
app.set('view engine', 'hbs');
app.use(express.urlencoded({ extended: false }));
app.use(cors());
mongoose.set('strictQuery', false);


const videoUrl = 'https://www.youtube.com/watch?v=ry9SYnV3svc';
const query = "What do you like about the company you're working for?";


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