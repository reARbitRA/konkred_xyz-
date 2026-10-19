import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define the 'users' table.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Supabase Auth UUID
  email: text('email').notNull(),
  displayName: text('display_name'),
  acceptedCopyrightTerms: boolean('accepted_copyright_terms').default(false).notNull(),
  canGenerateBlogs: boolean('can_generate_blogs').default(false).notNull(),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'blogs' table with a reference relation or as simple authorId string
export const blogs = pgTable('blogs', {
  id: serial('id').primaryKey(),
  authorId: text('author_id').notNull(),
  title: text('title').notNull(),
  category: text('category'),
  htmlContent: text('html_content').notNull(),
  desc: text('desc'),
  readTime: text('read_time'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'guestbook' table
export const guestbook = pgTable('guestbook', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role'),
  text: text('text').notNull(),
  timestamp: text('timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  blogs: many(blogs),
}));

export const blogsRelations = relations(blogs, ({ one }) => ({
  author: one(users, {
    fields: [blogs.authorId],
    references: [users.uid],
  }),
}));
