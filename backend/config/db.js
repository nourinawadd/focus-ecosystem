import mongoose from 'mongoose';
import dns from 'node:dns';

// Node's bundled DNS resolver (c-ares) can fail the `mongodb+srv` SRV lookup
// with ECONNREFUSED on restrictive networks (e.g. public WiFi that blocks
// TCP/53 or hands out an unreachable DNS server). Prefer public resolvers,
// then fall back to the system's so this works on any network.
dns.setServers([...new Set(['8.8.8.8', '1.1.1.1', ...dns.getServers()])]);

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
