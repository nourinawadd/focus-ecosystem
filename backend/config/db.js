import mongoose from 'mongoose';

const OPTIONS = {
  serverSelectionTimeoutMS: 5000,   // fail fast if no reachable node
  maxPoolSize:              10,     // cap concurrent sockets
  socketTimeoutMS:          45000,  // drop a socket stuck mid-operation
};

export async function connectDB() {
  mongoose.connection.on('error',        (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', ()    => console.warn('MongoDB disconnected'));

  await mongoose.connect(process.env.MONGO_URI, OPTIONS);
  console.log('MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.connection.close(false);
  console.log('MongoDB connection closed');
}
