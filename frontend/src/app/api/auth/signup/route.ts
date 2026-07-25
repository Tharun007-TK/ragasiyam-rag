import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const { email, password, username, fullName } = await req.json();

    if (!email || !password || !username || !fullName) {
      return NextResponse.json(
        { message: "Email, password, username, and full name are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("ragasiyam");
    const usersCollection = db.collection("users");

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { message: "User already exists" },
        { status: 422 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save to DB
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      username,
      fullName,
      createdAt: new Date(),
    });

    return NextResponse.json(
      { message: "User created", userId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
