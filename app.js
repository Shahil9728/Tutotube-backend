import express from 'express';
const app = express();
const port = process.env.PORT || 3001;
import fs from 'fs';
import cors from 'cors';
import mongoose from 'mongoose';
import { Configuration, OpenAIApi } from 'openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { YoutubeTranscript } from 'youtube-transcript';
import dotenv from 'dotenv';
dotenv.config();


app.use(express.json());
app.set('views', 'src');
app.set('view engine', 'hbs');
app.use(express.urlencoded({ extended: false }));
app.use(cors());
mongoose.set('strictQuery', false);

const openaiApiKey = process.env.API_KEY;
const configuration = new Configuration({
    apiKey: openaiApiKey,
});
const openai = new OpenAIApi(configuration);
const videoUrl = 'https://www.youtube.com/watch?v=ry9SYnV3svc';
const query = "What is the summary of the video?";


app.post('/api', async (req, res) => {
    const videoUrl = req.body.link;
    const query = req.body.query;
    const answer = await run(videoUrl, query);
    const text = answer.split('\n');
    const correctans = text.reduce((a, b) => a.length > b.length ? a : b, '');
    console.log(correctans)
    res.json({ correctans});
})


app.get('/', async (req, res) => {
    res.render('index.hbs');
})




const run = async (videoUrl, query) => {
    try {
        await transcribeAudio(videoUrl);
        console.log("Fetching query");
        const res = await getanswer(query);
        return res;
    } catch (error) {
        console.log("Error occurred: ", error);
    }
}
// run();



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
        const transcriptionData = new Transcription({
            text: transcription
        });
        await transcriptionData.save();
        console.log('Transcription data saved successfully in database!');
    } catch (error) {
        console.error('Error saving transcription data:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Fetch data from file. Convert into chunks. Create embeddings for both query and textchunks. Then perform 
// semantic searh and fetch the best document. Send the query and document to the openai and fetch result.
async function getanswer(query) {
    try {
        const data = await fs.promises.readFile("transcript.txt");
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const textChunks = await textSplitter.splitText(data.toString());
        const embeddings = await Promise.all(
            textChunks.map(async (doc) => {
                try {
                    const resp = await openai.createEmbedding({
                        model: "text-embedding-ada-002",
                        input: doc,
                    });
                    const embedding = resp?.data?.data[0]?.embedding;
                    if (!Array.isArray(embedding)) {
                        console.error(`Failed to generate embedding for document: ${doc}`);
                        return null;
                    }
                    return embedding;
                } catch (error) {
                    console.log(`Error generating embedding for document: ${doc}`, error);
                    throw error;
                }
            })
        );
        const resp = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: query,
        });
        const queryEmbedding = resp?.data?.data[0]?.embedding;
        function cosineSimilarity(a, b) {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }
        const similarityScores = embeddings.map((embedding) => {
            if (!embedding) {
                return NaN;
            }
            return cosineSimilarity(queryEmbedding, embedding);
        });
        const index = similarityScores.indexOf(Math.max(...similarityScores));
        const answer = textChunks[index];
        try {
            const response = await openai.createCompletion({
                model: "text-davinci-002",
                prompt:
                    "Find the answer of this  " + query + " from this paragraph " + answer,
                temperature: 1,
                max_tokens: 150,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });
            const ans = response.data.choices[0].text;
            return ans;
        } catch (error) {
            console.log(`Error creating completion for query "${query}" and document "${answer}"`, error);
            throw error;
        }
    } catch (error) {
        console.log("Error occurred: ", error);
    }
}


app.listen(port, (req, res) => {
    console.log(`Server is running at ${port}`);
})