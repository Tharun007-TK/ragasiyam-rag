import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const client = await clientPromise;
        const db = client.db("ragasiyam");
        const user = await db.collection("users").findOne({ email: credentials.email });

        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.fullName || "User",
          username: user.username || "user",
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  jwt: {
    // Override standard JWE encode/decode to use JWS, which FastAPI (PyJWT) easily parses
    encode: async ({ secret, token }) => {
      // Create a JWS (JSON Web Signature) token
      if (!token) return "";
      const signedToken = jwt.sign(token, secret as string, { algorithm: "HS256" });
      return signedToken;
    },
    decode: async ({ secret, token }) => {
      if (!token) return null;
      try {
        const decoded = jwt.verify(token, secret as string, { algorithms: ["HS256"] });
        return decoded as any;
      } catch (e) {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id; // sub is automatically mapped to id in FastAPI
        token.email = user.email;
        token.name = user.name;
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Expose token to client so it can pass it to FastAPI
        (session as any).accessToken = jwt.sign(token, process.env.NEXTAUTH_SECRET as string, { algorithm: "HS256" });
        session.user.id = token.sub;
        session.user.name = token.name;
        (session.user as any).username = token.username;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
