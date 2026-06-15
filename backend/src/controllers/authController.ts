import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_spreetail_assignment_2026';

// Register User
export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body;

  // 1. Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    // 2. Check if email already registered
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    // 5. Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error during registration.' });
  }
}

// Login User
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  // 1. Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 2. Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // 3. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // 4. Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error during login.' });
  }
}

// Get Current User Profile (useful for frontend state refresh)
export async function getProfile(req: Request, res: Response) {
  const userId = (req as any).userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error fetching profile.' });
  }
}
