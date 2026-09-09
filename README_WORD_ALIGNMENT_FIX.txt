WORD-LEVEL REALIGNMENT FIX
- Result comparison now highlights by WORD, not by character.
- One skipped word = one omission/error marker only.
- A partially typed word (even one character then space) = one wrong word only.
- Following correctly typed words re-align and remain correct.
- Multiple wrong characters inside the same word still count as one wrong word.
- Server scoring and accuracy remain word-aligned.
