"use client";

import { motion } from "framer-motion";

export default function SuggestedQuestions({
  questions,
  onSelect,
}: {
  questions: string[];
  onSelect: (q: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(q)}
            className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:border-[#5B4FCF] hover:text-[#5B4FCF] hover:bg-violet-50 transition-all font-medium shadow-sm text-left"
          >
            {q}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
