#!/usr/bin/env node

"use strict";
import { execSync } from "child_process";
import { getArgs, checkGitRepository } from "./helpers.js";
import { filterApi } from "./filterApi.js";
import { args } from "./config.js";
import axios from "axios";

const REGENERATE_MSG = "♻️ Regenerate Commit Messages";

const language = "english";

const commitType = args["commit-type"];

const processTemplate = ({ template, commitMessage }) => {
  if (!template.includes("COMMIT_MESSAGE")) {
    console.log(`Warning: template doesn't include {COMMIT_MESSAGE}`);

    return commitMessage;
  }

  let finalCommitMessage = template.replaceAll(
    "{COMMIT_MESSAGE}",
    commitMessage
  );

  if (finalCommitMessage.includes("GIT_BRANCH")) {
    const currentBranch = execSync("git branch --show-current")
      .toString()
      .replaceAll("\n", "");

    console.log("Using currentBranch: ", currentBranch);

    finalCommitMessage = finalCommitMessage.replaceAll(
      "{GIT_BRANCH}",
      currentBranch
    );
  }

  return finalCommitMessage;
};

const makeCommit = (input) => {
  console.log("Committing Message... 🚀 ");
  execSync(`git commit -F -`, { input });
  console.log("Commit Successful ! 🎉");
};

const sendMessage = async (input) => {
  const OLLAMA_API_ENDPOINT = "http://127.0.0.1:11434/api/generate";
  const MODEL = "llama3.2";

  try {
    const response = await axios.post(OLLAMA_API_ENDPOINT, {
      model: MODEL,
      prompt: input,
      stream: false,
    });

    return response.data.response;
  } catch (error) {
    console.error("Error communicating wi th Ollama:", error);
    process.exit(1);
  }
};

const getPromptForSingleCommit = (diff) => {
  return (
    "Create a single-line git commit message in lowercase using conventional commits format." +
    " Start with one of these types: feat, fix, chore, docs, style, refactor, perf, test, followed by a colon and a brief description." +
    (commitType ? ` Use commit type '${commitType}'.` : "") +
    " Example: 'feat: add user authentication'" +
    " Only provide the commit message, nothing else." +
    "\nDiff:\n" +
    diff
  );
};

const generateSingleCommit = async (diff) => {
  const prompt = getPromptForSingleCommit(diff);

  if (!(await filterApi({ prompt, filterFee: args["filter-fee"] })))
    process.exit(1);

  const text = await sendMessage(prompt);

  console.log(
    `Proposed Commit:\n------------------------------\n${text}\n------------------------------`
  );

  if (args.force) {
    makeCommit(text);
    return;
  }

  const inquirer = await import("inquirer");
  const answer = await inquirer.default.prompt([
    {
      type: "confirm",
      name: "continue",
      message: "Do you want to continue?",
      default: true,
    },
  ]);

  if (!answer.continue) {
    console.log("Commit aborted by user 🙅‍♂️");
    process.exit(1);
  }

  makeCommit(text);
};

const generateListCommits = async (diff, numOptions = 5) => {
  const prompt =
    "I want you to act as the author of a commit message in git." +
    `I'll enter a git diff, and your job is to convert it into a useful commit message in ${language} language` +
    (commitType ? ` with commit type '${commitType}.', ` : ", ") +
    `and make ${numOptions} options that are separated by ";".` +
    "For each option, use the present tense, return the full sentence, and use the conventional commits specification (<type in lowercase>: <subject>):" +
    diff;

  if (
    !(await filterApi({
      prompt,
      filterFee: args["filter-fee"],
      numCompletion: numOptions,
    }))
  )
    process.exit(1);

  const text = await sendMessage(prompt);

  let msgs = text.split(";").map((msg) => msg.trim());

  if (args.template) {
    msgs = msgs.map((msg) =>
      processTemplate({
        template: args.template,
        commitMessage: msg,
      })
    );
  }

  msgs.push(REGENERATE_MSG);

  const inquirer = await import("inquirer");
  const answer = await inquirer.default.prompt([
    {
      type: "list",
      name: "commit",
      message: "Select a commit message",
      choices: msgs,
    },
  ]);

  if (answer.commit === REGENERATE_MSG) {
    await generateListCommits(diff);
    return;
  }

  makeCommit(answer.commit);
};

async function generateAICommit() {
  const isGitRepository = checkGitRepository();

  if (!isGitRepository) {
    console.error("This is not a git repository 🙅‍♂️");
    process.exit(1);
  }

  const diff = execSync("git diff --staged").toString();

  if (!diff) {
    console.log("No changes to commit 🙅");
    console.log(
      "Maybe you forgot to add the files? Try git add . and then run this script again."
    );
    process.exit(1);
  }

  args.list
    ? await generateListCommits(diff)
    : await generateSingleCommit(diff);
}

await generateAICommit();
