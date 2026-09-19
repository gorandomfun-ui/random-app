/**
 * Keeping the quizzes fetched while visitors play.
 *
 * Open Trivia DB is queried live to keep a queue of six questions ahead, and
 * those questions were served and then dropped. They are free, already
 * fetched, and each one is a content a Wave could use — so they are stored,
 * tagged like everything else, and deduplicated by the question id.
 *
 * Writing happens away from the request: a visitor waiting on a quiz should
 * never wait on a database write.
 */

import type { Db, Document } from 'mongodb'

import { tagForInsert } from '../tagging/atInsert'

export type StorableQuiz = Document & {
  type: 'fact'
  variant: 'quiz'
  text?: string
  quiz?: { id?: string; question?: string }
  provider?: string
}

let inFlight: Promise<void> | null = null

async function write(db: Db, quizzes: StorableQuiz[]): Promise<void> {
  const usable = quizzes.filter((quiz) => quiz.quiz?.question && quiz.quiz.id)
  if (!usable.length) return

  const tagged = await tagForInsert(db, usable as never)

  const operations = usable.map((quiz, index) => ({
    updateOne: {
      // The question id is stable across fetches, which is what stops the same
      // question being stored again every time it is served.
      filter: { type: 'fact', 'quiz.id': quiz.quiz?.id } as never,
      update: {
        $set: { ...quiz, v3: (tagged[index] as { v3?: unknown }).v3, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date(), rand: Math.random() },
      },
      upsert: true,
    },
  }))

  await db.collection('items').bulkWrite(operations, { ordered: false })
}

/**
 * Stores quizzes without making the caller wait, and never lets a write
 * failure surface: a quiz that cannot be saved is still a quiz worth serving.
 */
export function rememberQuizzes(db: Db, quizzes: StorableQuiz[]): void {
  if (!quizzes.length) return
  // One write at a time; the queue refills six at a time, not in bursts.
  if (inFlight) return

  inFlight = write(db, quizzes)
    .catch((error) => {
      console.error('[v3/quiz] enregistrement impossible', error)
    })
    .finally(() => {
      inFlight = null
    })
}
