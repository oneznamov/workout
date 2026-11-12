"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { archiveExerciseAction } from "@/lib/actions";

export function ArchiveExerciseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => window.confirm("Прибрати вправу з бібліотеки? Історія тренувань збережеться.") && start(() => archiveExerciseAction(id))}
      className="btn btn-danger"
    >
      <Trash2 size={16} /> Прибрати
    </button>
  );
}
