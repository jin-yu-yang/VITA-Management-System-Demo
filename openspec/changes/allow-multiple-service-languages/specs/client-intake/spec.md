## ADDED Requirements

### Requirement: A client can name other languages we can help them in
After the preferred service language (Q0.3 `language`, unchanged, required) and its "Please specify" box (Q0.4), the intake SHALL ask Q0.5 `language_also`, "Any other languages we can help you in?" (我们还可以用哪些语言为您服务？). It is optional and multi-select, with the same options as Q0.3: English, Cantonese, Mandarin and Other. Its tip is "Choose all that apply. Leave this blank if only your preferred language works for you." (可多选。如果只能使用首选语言，请留空。).

When Q0.5 includes Other, the intake SHALL ask Q0.6 `language_also_other`, "Please specify" (请说明), an optional text answer. The standard and senior versions SHALL use the same wording. Leaving Q0.5 empty SHALL NOT block the application. The preferred language SHALL stay a single, required answer, and existing applications' answers SHALL keep working without any change.

#### Scenario: A client who also speaks Mandarin
- **WHEN** a client chooses Cantonese as their preferred language and ticks Mandarin in Q0.5
- **THEN** the application's answers hold `language` "cantonese" and `language_also` ["mandarin"]

#### Scenario: Another language not on the list
- **WHEN** a client ticks Other in Q0.5
- **THEN** Q0.6 "Please specify" appears, and what they type is saved as `language_also_other`

#### Scenario: Only the preferred language
- **WHEN** a client leaves Q0.5 empty
- **THEN** no missing answer is reported for it, and the application can be submitted

#### Scenario: An application saved before the change
- **WHEN** a client opens an application saved before Q0.5 existed
- **THEN** their preferred language is still chosen, and Q0.5 is empty

### Requirement: The progress page lists every language the client named
The client's progress page SHALL list every language the client named, by full name in the screen language:
- the preferred language first, then the others, in the order of the options;
- no language listed twice;
- for Other, the name the client typed, or "Other" when they typed nothing.

It SHALL NOT use letter abbreviations.

#### Scenario: Preferred and other languages
- **WHEN** a client who prefers Cantonese and also named Mandarin opens their progress page in English
- **THEN** the Language row reads "Cantonese, Mandarin"

#### Scenario: In Chinese, with a typed language
- **WHEN** a client who prefers Mandarin and also named Other, typing "Vietnamese", opens their progress page in Simplified Chinese
- **THEN** the Language row reads "普通话、Vietnamese"
