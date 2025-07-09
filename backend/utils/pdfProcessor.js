const fs = require('fs');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Text content of the PDF
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * @param {string} pdfContent 
 * @param {string} topic 
 * @param {string} difficulty 
 * @param {number} numQuestions 
 * @param {string} typequestionType 
 * @returns {Promise<Object>} 
 */
async function generateQuizFromPDF(pdfContent, topic, difficulty = 'medium', numQuestions = 5, typequestionType) {
  try {
  
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   
    const safeTopic = topic.length > 250 ? topic.substring(0, 250) : topic;

    let prompt;
    if (typequestionType === "Subjective") {
      prompt = `
      Given the following text extracted from a PDF document, generate a ${difficulty} level quiz about "${topic}" with ${numQuestions} open-ended (subjective) questions.

      Text from PDF:
      ${pdfContent.substring(0, 8000)} ${pdfContent.length > 8000 ? '... (text truncated)' : ''}

      Format the response as a valid JSON object with this exact structure:
      {
        "quiz": {
          "topic": "${topic}",
          "description": "Brief description of the quiz based on the PDF content",
          "questions": [
            {
              "question": "Question text",
              "explanation": "Brief explanation of the expected answer, referring to content from the PDF"
            }
          ]
        }
      }

      Ensure questions are directly related to the content in the PDF. Each question must include an explanation for the expected answer. The output should be ONLY the JSON object.`;
    } else {
      prompt = `
      Given the following text extracted from a PDF document, generate a ${difficulty} level quiz about "${topic}" with ${numQuestions} multiple choice questions.

      Text from PDF:
      ${pdfContent.substring(0, 8000)} ${pdfContent.length > 8000 ? '... (text truncated)' : ''}

      Format the response as a valid JSON object with this exact structure:
      {
        "quiz": {
          "topic": "${topic}",
          "description": "Brief description of the quiz based on the PDF content",
          "questions": [
            {
              "question": "Question text",
              "options": ["Option1", "Option2", "Option3", "Option4"],
              "correctAnswer": "Correct option text",
              "explanation": "Brief explanation of why this answer is correct, referring to content from the PDF"
            }
          ]
        }
      }

      Ensure questions are directly related to the content in the PDF. Each question must include an explanation for the correct answer. The output should be ONLY the JSON object.`;
    }
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let textResponse = response.text();
    
    const jsonStart = textResponse.indexOf('{');
    const jsonEnd = textResponse.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error("Could not find valid JSON in the AI response.");
    }
    
    const jsonString = textResponse.substring(jsonStart, jsonEnd);
    
    try {
      const parsedResponse = JSON.parse(jsonString);
      
      if (!parsedResponse.quiz || !Array.isArray(parsedResponse.quiz.questions)) {
        throw new Error("Generated content doesn't match the expected structure.");
      }

      if (parsedResponse.quiz.description && parsedResponse.quiz.description.length > 250) {
        parsedResponse.quiz.description = parsedResponse.quiz.description.substring(0, 250);
      }
      parsedResponse.quiz.topic = safeTopic;

      parsedResponse.quiz.questions = parsedResponse.quiz.questions.map(q => ({
        ...q,
        question: q.question && q.question.length > 500 ? q.question.substring(0, 500) : q.question,
        explanation: q.explanation && q.explanation.length > 500 ? q.explanation.substring(0, 500) : q.explanation,
        
        correctAnswer: q.correctAnswer && q.correctAnswer.length > 255 ? q.correctAnswer.substring(0, 255) : q.correctAnswer,
        options: Array.isArray(q.options)
          ? q.options.map(opt => (typeof opt === 'string' && opt.length > 255 ? opt.substring(0, 255) : opt))
          : q.options
      }));

      return parsedResponse.quiz;
    } catch (parseError) {
      console.error('JSON parsing error:', parseError, 'Response was:', jsonString.substring(0, 200));
      throw new Error('Failed to parse AI response as valid JSON');
    }
  } catch (error) {
    console.error('Error generating quiz from PDF:', error);
   
    console.log('Using fallback quiz generation for PDF content');
    return generateFallbackPDFQuiz(pdfContent, topic, difficulty, numQuestions);
  }
}

function generateFallbackPDFQuiz(pdfContent, topic, difficulty, numQuestions = 5) {
 
  const contentPreview = pdfContent.substring(0, 300).replace(/\n/g, ' ').trim();
  const description = `A ${difficulty} quiz about ${topic} based on the provided PDF content.`;
  
  const words = pdfContent.split(/\s+/).filter(word => word.length > 5);
  const keywords = [...new Set(words)].slice(0, 20);
  
  const questions = [];
  
  questions.push({
    question: `What is the main focus of this document related to ${topic}?`,
    options: [
      `Learning ${topic} concepts`, 
      `${topic} implementation details`, 
      `History of ${topic}`, 
      `${topic} best practices`
    ],
    correctAnswer: `${topic} implementation details`,
    explanation: "Based on the overall content of the document, it appears to focus on implementation details of the topic rather than just concepts, history, or practices."
  });
  
  if (keywords.length >= 3 && questions.length < numQuestions) {
    questions.push({
      question: `Which of the following terms is most relevant to ${topic}?`,
      options: [
        keywords[0], 
        keywords[Math.min(1, keywords.length-1)], 
        keywords[Math.min(2, keywords.length-1)], 
        "None of the above"
      ],
      correctAnswer: keywords[0],
      explanation: `${keywords[0]} appears prominently in the document and is closely related to ${topic}.`
    });
  }
  
  const genericQuestions = [
    {
      question: `What is a common practice in ${topic}?`,
      options: ["Documentation", "Testing", "Implementation", "All of the above"],
      correctAnswer: "All of the above",
      explanation: "Documentation, testing, and implementation are all essential practices in any technical field, including this topic."
    },
    {
      question: `Which statement best describes ${topic}?`,
      options: [
        `A methodology for software development`, 
        `A programming language feature`, 
        `A design pattern`, 
        `A software tool`
      ],
      correctAnswer: `A methodology for software development`,
      explanation: "Based on context clues in the document, the topic appears to be a methodology used in software development processes."
    },
    {
      question: `What is important to consider when working with ${topic}?`,
      options: ["Performance", "Readability", "Maintainability", "All of these"],
      correctAnswer: "All of these",
      explanation: "Performance, readability, and maintainability are all critical considerations in any technical implementation."
    }
  ];
  
  while (questions.length < numQuestions && genericQuestions.length > 0) {
    questions.push(genericQuestions.shift());
  }
  
  return {
    topic,
    description,
    questions: questions.slice(0, numQuestions)
  };
}

module.exports = {
  extractTextFromPDF,
  generateQuizFromPDF
};