# Colophon

A handscroll painting stays open on the page. Under it, in the order they were
written, sit the notes strangers have left in its margin — one line each, no
account, no name, nothing that can be edited or deleted once it's there. It is
alive the way a scroll is alive: everyone who has ever unrolled it left
something behind, and the next person can still find it.

## What good means here

Chinese handscrolls were never finished when the painter set the brush down.
Later owners and admirers kept adding their own inscriptions and seals after
the image, sheet by sheet, so that a scroll only a foot square in its painted
part could grow twenty feet long from six centuries of appended commentary —
the [Met's history of the format](https://www.metmuseum.org/essays/chinese-handscrolls)
calls this "a continuous dialogue" between the work and everyone who has since
sat with it. That is the shape of multi-user, real-time and persistent I
wanted: not a feed, but one object that a small, unhurried stream of people
add to, permanently, leaving a trace the next visitor can actually find.

Three other things I read while deciding what small and good looks like here:

- Robin Sloan's [_An app can be a home-cooked meal_](https://www.robinsloan.com/notes/home-cooked-app/)
  argues the best case for a tiny app is never that it will grow, but that it
  is finished, sovereign and answers only to the few people it was built for.
  This app answers to whoever writes in the margin, not to a growth number.
- [Hundred Rabbits](https://sourcehut.org/blog/2021-12-08-100-rabbits-interview/),
  who build their own software from a sailboat, say "if we can use less
  technology to solve any one task, we will" and prize software that "gets
  smaller over time, that sheds the superfluous" — the whole app is closer
  to a workshop tool built for one particular painting than a platform
  built to hold any painting at all.
- Bernie DeKoven's [_The Well-Played Game_](https://www.deepfun.com/fun-store/the-well-played-game/)
  says a shared act is worth more for the quality of playing it together than
  for any individual score — there is no score here, no likes, nothing to
  win, only the quality of what gets left behind.

## What I chose not to build

No accounts, avatars or profiles — a visitor is only the anonymous seal their
browser is given on first visit, the same way a real seal marks presence
without disclosing a name. No editing or deleting a colophon once it's
written: ink doesn't come back off the paper, and a length limit (320
characters) is the constraint that keeps a visitor considering a line rather
than typing a paragraph. No likes, no replies, no threading, no feed of other
people's activity, no notifications.

Nothing about *who* else is reading is shown either. The one exception is a
single number beside the title, 過眼 ("passed before the eyes", the seal a
real viewer pressed onto a scroll to say they had seen it without saying who
they were): how many browsers have the scroll open right now. A count is not
a feed. It names no one and says nothing about what anyone did; it only
tells a visitor that the object in front of them is being looked at, which
is the thing a scroll's viewing seals have always recorded. Names, glyphs or
anything else that picks out a viewer, typing indicators and "someone is
writing" stay out.

## What's enforced, what's judged

`spec/` checks that a colophon written now is still there on the next
request, that a visitor's own colophons are the ones marked as theirs (and
nobody else's are), and that an empty or over-length line is rejected rather
than silently corrupted. Whether the tone of what accumulates actually reads
like a colophon — considered, brief, worth adding to a shared object — rather
than chat is not something a test can check; that's for whoever reads the
margin to judge.
