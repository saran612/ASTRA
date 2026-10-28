import json
import os
import re
from typing import Optional, Dict, Any, List

CORPUS_PATH = os.path.join(os.path.dirname(__file__), "data", "handbook", "aph_clauses.json")

class HandbookRAG:
    def __init__(self, corpus_path: str = CORPUS_PATH):
        self.corpus_path = corpus_path
        self.clauses: List[Dict[str, Any]] = []
        self._load_corpus()

    def _load_corpus(self):
        if os.path.exists(self.corpus_path):
            with open(self.corpus_path, "r", encoding="utf-8") as f:
                self.clauses = json.load(f)
        else:
            self.clauses = []

    def _tokenize(self, text: str) -> set:
        clean = re.sub(r"[^\w\s]", " ", text.lower())
        words = [w for w in clean.split() if len(w) > 2]
        return set(words)

    def search(self, query: str, threshold: float = 0.35) -> Dict[str, Any]:
        """
        Retrieves matching Approval Process Handbook (APH) clause for query.
        Returns strict clause citation or fallback if not found in corpus.
        """
        if not self.clauses:
            return {
                "found": False,
                "clause_id": None,
                "answer": "Approval Process Handbook corpus unavailable. Manual verification required.",
                "similarity": 0.0,
            }

        q_tokens = self._tokenize(query)
        if not q_tokens:
            return {
                "found": False,
                "clause_id": None,
                "answer": "Empty query provided. Manual verification required.",
                "similarity": 0.0,
            }

        best_clause = None
        best_score = 0.0

        for clause in self.clauses:
            clause_tokens = self._tokenize(clause["title"] + " " + clause["text"] + " " + clause["category"])
            if not clause_tokens:
                continue

            intersection = q_tokens.intersection(clause_tokens)
            if not intersection:
                continue

            # Query keyword coverage
            coverage = len(intersection) / len(q_tokens)
            score = coverage
            
            # Boost score if category or title matches key query words
            title_tokens = self._tokenize(clause["title"])
            title_overlap = q_tokens.intersection(title_tokens)
            if title_overlap:
                score += 0.25 * (len(title_overlap) / len(q_tokens))

            if score > best_score:
                best_score = score
                best_clause = clause

        if best_clause and best_score >= threshold:
            return {
                "found": True,
                "clause_id": best_clause["clause_id"],
                "title": best_clause["title"],
                "category": best_clause["category"],
                "text": best_clause["text"],
                "answer": f"According to {best_clause['clause_id']} ({best_clause['title']}): {best_clause['text']}",
                "similarity": round(best_score, 4),
            }

        return {
            "found": False,
            "clause_id": None,
            "answer": "Clause not found in Approval Process Handbook corpus. Manual verification required.",
            "similarity": round(best_score, 4),
        }

rag_engine = HandbookRAG()
