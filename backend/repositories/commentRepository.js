const comments = [];
let nextId = 1;

const clone = (comment) => ({ ...comment, author: { ...comment.author } });

const listByProposal = (proposalId) => comments
  .filter((comment) => comment.proposalId === proposalId)
  .map(clone);

const create = ({ proposalId, text, author, aiOperationId, orgUnitId }) => {
  const comment = {
    id: `CMT-${String(nextId++).padStart(4, "0")}`,
    proposalId,
    text,
    orgUnitId: orgUnitId || null,
    ...(aiOperationId ? { aiOperationId } : {}),
    author: { ...author },
    createdAt: new Date().toISOString()
  };
  comments.push(comment);
  return clone(comment);
};

const memoryRepository = { listByProposal, create };
module.exports = process.env.VERA_EVIDENCE_COMMENT_STORE === "supabase"
  ? require("./supabaseCommentRepository")
  : memoryRepository;
