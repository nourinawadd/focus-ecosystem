import 'dotenv/config';
import express  from 'express';
import mongoose from 'mongoose';
import cors     from 'cors';
import './models/User.js';
import './models/NFCTag.js';
import './models/UserTag.js';
import './models/Session.js';
import './models/FocusLog.js';
import './models/Statistics.js';
import './models/AIInsight.js';
import authRoutes      from './routes/auth.js';
import userRoutes      from './routes/user.js';
import sessionRoutes   from './routes/sessions.js';
import analyticsRoutes from './routes/analytics.js';
import errorHandler    from './middleware/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/user',      userRoutes);
app.use('/api/sessions',  sessionRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.use(errorHandler);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });