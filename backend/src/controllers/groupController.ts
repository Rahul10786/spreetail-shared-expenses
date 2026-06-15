import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

// Create a Group
export async function createGroup(req: AuthRequest, res: Response) {
  const { name, description } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!name) return res.status(400).json({ error: 'Group name is required.' });

  try {
    // 1. Create the Group and automatically add the creator as a member in a single transaction
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name,
          description,
          createdById: userId,
        },
      });

      // Creator joins the group immediately
      await tx.groupMember.create({
        data: {
          groupId: g.id,
          userId: userId,
          joinDate: new Date(),
          isActive: true,
        },
      });

      return g;
    });

    return res.status(201).json({ message: 'Group created successfully', group });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error creating group.' });
  }
}

// Get all Groups the user belongs to
export async function getGroups(req: AuthRequest, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId, isActive: true },
      include: {
        group: {
          include: {
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    const groups = memberships.map((m) => m.group);
    return res.status(200).json({ groups });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching groups.' });
  }
}

// Get a single Group's detail (members, expenses, settlements)
export async function getGroupDetail(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Verify user is a member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        expenses: {
          orderBy: { date: 'desc' },
          include: {
            paidBy: {
              select: { id: true, name: true, email: true },
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
        settlements: {
          orderBy: { date: 'desc' },
          include: {
            payFrom: { select: { id: true, name: true, email: true } },
            payTo: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    return res.status(200).json({ group });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching group details.' });
  }
}

// Edit a Group
export async function updateGroup(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const { name, description } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    // Only creator can edit group details (or members; for simplicity, we allow any active member)
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership || !membership.isActive) {
      return res.status(403).json({ error: 'Only active group members can update group details.' });
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: { name, description },
    });

    return res.status(200).json({ message: 'Group updated successfully.', group: updatedGroup });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating group.' });
  }
}

// Delete a Group
export async function deleteGroup(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    // Only group creator can delete group
    if (group.createdById !== userId) {
      return res.status(403).json({ error: 'Only the group creator can delete this group.' });
    }

    await prisma.group.delete({ where: { id: groupId } });
    return res.status(200).json({ message: 'Group deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error deleting group.' });
  }
}

// Add a Member (Dynamic Membership Join)
export async function addMember(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const { email, joinDate } = req.body;
  const requesterId = req.userId;

  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });
  if (!email) return res.status(400).json({ error: 'Member email is required.' });

  try {
    // 1. Verify requester is active member of this group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: requesterId } },
    });

    if (!requesterMembership || !requesterMembership.isActive) {
      return res.status(403).json({ error: 'You must be an active member of this group to invite others.' });
    }

    // 2. Find target user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found. They must register first.' });
    }

    const parsedJoinDate = joinDate ? new Date(joinDate) : new Date();

    // 3. Check if membership already exists
    const existingMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUser.id } },
    });

    if (existingMembership) {
      if (existingMembership.isActive) {
        return res.status(400).json({ error: 'User is already a member of this group.' });
      }

      // Re-activate a member who previously left
      const updatedMembership = await prisma.groupMember.update({
        where: { id: existingMembership.id },
        data: {
          isActive: true,
          joinDate: parsedJoinDate,
          leaveDate: null,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return res.status(200).json({ message: 'Member reactivated successfully.', member: updatedMembership });
    }

    // 4. Create new membership
    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: targetUser.id,
        joinDate: parsedJoinDate,
        isActive: true,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return res.status(201).json({ message: 'Member added successfully.', member: newMember });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error adding group member.' });
  }
}

// Remove/Leave a Group (Dynamic Membership Leave)
export async function leaveGroup(req: AuthRequest, res: Response) {
  const { groupId, userId } = req.params; // userId is the member leaving
  const requesterId = req.userId;

  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Verify requester is in group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: requesterId } },
    });

    if (!requesterMembership || !requesterMembership.isActive) {
      return res.status(403).json({ error: 'You must be a member of the group.' });
    }

    // Only allow users to remove themselves, OR allow the creator to remove members
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (userId !== requesterId && group.createdById !== requesterId) {
      return res.status(403).json({ error: 'You are not authorized to remove this member.' });
    }

    // Check if membership exists
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership || !membership.isActive) {
      return res.status(400).json({ error: 'Member is not actively in this group.' });
    }

    const { leaveDate } = req.body;
    const parsedLeaveDate = leaveDate ? new Date(leaveDate) : new Date();

    if (parsedLeaveDate < membership.joinDate) {
      return res.status(400).json({ error: 'Leave date cannot be before join date.' });
    }

    const updatedMembership = await prisma.groupMember.update({
      where: { id: membership.id },
      data: {
        isActive: false,
        leaveDate: parsedLeaveDate,
      },
    });

    return res.status(200).json({ message: 'Member left group successfully.', member: updatedMembership });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error leaving group.' });
  }
}
