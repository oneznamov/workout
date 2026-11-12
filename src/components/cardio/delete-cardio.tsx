"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCardioAction } from "@/lib/actions";

export function DeleteCardioButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => window.confirm("Видалити цей запис?") && start(() => deleteCardioAction(id))} className="btn btn-danger">
      <Trash2 size={16} /> Видалити
    </button>
  );
}
