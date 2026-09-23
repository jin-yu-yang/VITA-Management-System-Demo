# Tax Help Intake Form: Question Design (for Online Form)

> Source: IRS Form 13614-C (Rev. 10-2025) + Form 15080 (Rev. 10-2025)
> Tax year: **2025**
> Every question includes: plain-English wording, Chinese wording, field ID, input type, and display conditions.

---

## Design Conventions (for developers)

- **Language level**: Short sentences, everyday words. When a technical term is unavoidable, explain it in parentheses or a Tip right after it.
- **One question per screen or per group**: Don't stack too much on one page.
- **"Who" multi-select questions**: Many questions ask "you or your spouse". The standard options are:
  - `me` (Me / 我自己)
  - `spouse` (My spouse / 我的配偶), **shown only when married**
  - `none` (No / Not me / 都不是), which clears the other two when selected
- **Every Yes/No question** has an extra option: `not_sure` (I'm not sure / 我不确定). The volunteer will confirm it in person.
- **Show if** = the question appears only when the condition is met.
- Fields on the paper form marked "To be completed by certified volunteer" **do not appear on the public-facing form** (see the appendix).

---

## Section 0: Before You Start

**Page text (no input required):**

> Please bring these with you to your appointment:
> - Tax papers you got in the mail, like **W-2** (from your job), **1099**, **1098**, **1095**
> - **Social Security card** or **ITIN letter** for everyone on your tax return
> - **Photo ID** (like a driver's license) for you and your spouse
>
> You are responsible for the information on your tax return. Please answer honestly and completely.
> If you don't understand a question, choose "I'm not sure." A volunteer will help you.
>
> 请带上：W-2、1099、1098、1095 等税表；报税表上每个人的社会安全卡或 ITIN 信；您和配偶的带照片证件（如驾照）。
> 看不懂的问题可以选"我不确定"，志愿者会帮您。

To report unethical behavior by a volunteer: ts.voltax@irs.gov

---

## Section 1: About You

**Q1.1** What is your first name? / 您的名字（名）是什么？
`tp_first_name` · Text · Required
> Tip: Write it the same way as on your Social Security card.

**Q1.2** What is your middle name? / 您的中间名字是什么？
`tp_middle_initial` · Text (1 character) · Optional
> Tip: If you don't have a middle name, leave this empty.

**Q1.3** What is your last name? / 您的姓是什么？
`tp_last_name` · Text · Required

**Q1.4** When were you born? / 您的出生日期是？
`tp_dob` · Date (MM/DD/YYYY) · Required

**Q1.5** What is your job? / 您做什么工作？
`tp_job_title` · Text · Required
> Tip: For example: cook, cashier, driver, retired, student, no job.

**Q1.6** What is your phone number? / 您的电话号码是？
`tp_phone` · Phone · Required

**Q1.7** What is your email? (You can skip this.) / 您的电子邮箱？（可以不填）
`email` · Email · Optional

---

## Section 2: Your Address

**Q2.1** What is your street address? / 您的街道地址？
`addr_street` · Text · Required
> Tip: This is where you get your mail.

**Q2.2** Apartment number (if you have one) / 公寓号（如有）
`addr_apt` · Text · Optional

**Q2.3** City / 城市
`addr_city` · Text · Required

**Q2.4** State / 州
`addr_state` · Dropdown (US states) · Required

**Q2.5** ZIP code / 邮编
`addr_zip` · Text (5 digits) · Required

---

## Section 3: Marriage

**Q3.1** On December 31, 2025, were you… / 在 2025 年 12 月 31 日，您的婚姻状况是？
`marital_status` · Single choice · Required
- `never_married`: Never married / 从未结婚
- `married`: Married / 已婚
- `divorced`: Divorced / 离婚
- `separated`: Legally separated, but not divorced / 法律上分居，但没有离婚
- `widowed`: My husband or wife died / 丧偶

> Tip: "Legally separated" means a court gave you a paper saying you are separated. Just living apart is not the same.

**Q3.2** Were you still married on the last day of 2025 (December 31)? / 在 2025 年最后一天，您还是已婚吗？
`married_last_day` · Yes / No · **Show if** `marital_status = married`

**Q3.3** From July 1 to December 31, 2025, did you and your spouse live in different homes the whole time? / 2025 年 7 月 1 日到 12 月 31 日，您和配偶是否一直分开住？
`lived_apart_last_6mo` · Yes / No · **Show if** `marital_status = married`

**Q3.4** What date was your divorce made final? / 离婚正式生效的日期？
`divorce_date` · Date · **Show if** `marital_status = divorced`
> Tip: This date is on your divorce papers from the court.

**Q3.5** What date did the court make your separation official? / 法院批准分居的日期？
`separation_date` · Date · **Show if** `marital_status = separated`

**Q3.6** What year did your spouse die? / 配偶是哪一年去世的？
`spouse_death_year` · Year · **Show if** `marital_status = widowed`

---

## Section 4: About Your Spouse

> **Show this whole section if** `marital_status = married`

**Q4.1** Your spouse's first name / 配偶的名字（名）
`sp_first_name` · Text · Required

**Q4.2** Your spouse's middle initial / 配偶中间名首字母
`sp_middle_initial` · Text (1 character) · Optional

**Q4.3** Your spouse's last name / 配偶的姓
`sp_last_name` · Text · Required

**Q4.4** Your spouse's date of birth / 配偶的出生日期
`sp_dob` · Date · Required

**Q4.5** Your spouse's job / 配偶做什么工作？
`sp_job_title` · Text · Required

**Q4.6** Your spouse's phone number / 配偶的电话号码
`sp_phone` · Phone · Optional

---

## Section 5: Your Situation in 2025

> Use the "Who" multi-select (Me / My spouse / No one) for Q5.3–Q5.9.

**Q5.1** In 2025, did you live or work in 2 or more states? / 2025 年您是否在两个或以上的州生活或工作过？
`multi_state` · Yes / No / Not sure
> Tip: For example, you live in New York but work in New Jersey.

**Q5.2** Can someone else (like a parent) list you or your spouse as a dependent on their tax return? / 是否有别人（比如父母）可以在他们的报税表上把您或配偶列为受抚养人？
`claimed_by_other` · Yes / No / Not sure
> Tip: This often happens with students or young people whose parents still support them.

**Q5.3** Who is a U.S. citizen? / 谁是美国公民？
`us_citizen` · Who (multi-select)

**Q5.4** Who was in the U.S. on a visa in 2025? / 2025 年谁是持签证在美国？
`on_visa` · Who (multi-select)
> Tip: A visa is permission to stay in the U.S. for a certain time, like a student visa or work visa. A green card is **not** a visa.

**Q5.5** Who was a full-time student in 2025? / 2025 年谁是全日制学生？
`fulltime_student` · Who (multi-select)
> Tip: Full-time means the school says you take a full load of classes, for at least 5 months of the year.

**Q5.6** Who is legally blind? / 谁在法律上被认定为失明？
`legally_blind` · Who (multi-select)
> Tip: A doctor said you cannot see well even with glasses.

**Q5.7** Who is totally and permanently disabled? / 谁是完全且永久性残疾？
`disabled` · Who (multi-select)
> Tip: A doctor said you cannot work because of a health problem that will last at least 1 year or forever.

**Q5.8** Who got an Identity Protection PIN (IP PIN) from the IRS? / 谁收到过 IRS 发的身份保护 PIN 码（IP PIN）？
`ippin` · Who (multi-select)
> Tip: This is a 6-digit number the IRS sends you by mail each year to protect you from identity theft. If you have one, bring the letter.

**Q5.9** Who owned or held any digital money (like Bitcoin or other crypto) in 2025? / 2025 年谁拥有或持有数字货币（比如比特币）？
`digital_assets` · Who (multi-select)

---

## Section 6: People Who Live With You or That You Help

**Intro text:**
> Tell us about **everyone who lived with you in 2025** (not your spouse).
> Also tell us about **anyone you gave money to for living costs**, even if they did not live with you.
> For example: your children, your parents, other family members.
>
> 请列出 2025 年和您住在一起的所有人（配偶除外），以及您出钱养活但不住在一起的人。

**Q6.0** Did anyone live with you or depend on you for money in 2025? / 2025 年是否有人和您同住，或靠您养活？
`has_household_members` · Yes / No

> **Show if** `has_household_members = yes`: Repeatable group "Add a person" (the paper form has 4 rows; the online form can allow more).

For each person:

**Q6.1** First and last name / 姓名
`hh[i].name` · Text · Required

**Q6.2** Date of birth / 出生日期
`hh[i].dob` · Date · Required

**Q6.3** How is this person related to you? / 这个人和您是什么关系？
`hh[i].relationship` · Dropdown · Required
- Son / Daughter (儿子/女儿), Stepchild (继子女), Foster child (寄养子女), Grandchild (孙子女/外孙子女), Brother / Sister (兄弟姐妹), Niece / Nephew (侄子女/外甥子女), Parent (父母), Grandparent (祖父母), Other relative (其他亲戚), Not related (没有亲戚关系)

**Q6.4** How many months did this person live in your home in 2025? / 2025 年这个人在您家住了几个月？
`hh[i].months_lived` · Number 0–12 · Required
> Tip: If they were born in 2025 and lived with you since birth, choose 12.

**Q6.5** Was this person married on December 31, 2025? / 在 2025 年 12 月 31 日，这个人结婚了吗？
`hh[i].married` · Yes (Married) / No (Single)

**Q6.6** Is this person a U.S. citizen? / 这个人是美国公民吗？
`hh[i].us_citizen` · Yes / No / Not sure

**Q6.7** Does this person live in the U.S., Canada, or Mexico? / 这个人住在美国、加拿大或墨西哥吗？
`hh[i].resident_na` · Yes / No / Not sure

**Q6.8** Was this person a full-time student in 2025? / 2025 年这个人是全日制学生吗？
`hh[i].fulltime_student` · Yes / No / Not sure

**Q6.9** Is this person totally and permanently disabled? / 这个人是完全且永久性残疾吗？
`hh[i].disabled` · Yes / No / Not sure

**Q6.10** Did this person get an IP PIN from the IRS? / 这个人收到过 IRS 的身份保护 PIN 码吗？
`hh[i].ippin` · Yes / No / Not sure

---

## Section 7: Your Refund or Payment

**Q7.1** If you get money back (a refund), how do you want to get it? / 如果您能退税，想怎么收钱？
`refund_method` · Single choice
- `direct_deposit`: Put it straight into my bank account / 直接存入我的银行账户（最快）
- `check`: Mail me a paper check / 邮寄支票给我
- `split`: Split it into more than one bank account / 分到多个银行账户
- `other`: Other / 其他

**Q7.1a** Please tell us more / 请说明
`refund_method_other` · Text · **Show if** `refund_method = other`

**Q7.2** If you owe money, how do you want to pay? / 如果您需要补税，想怎么付？
`payment_method` · Single choice
- `bank_account`: Take it from my bank account / 从我的银行账户扣款
- `direct_pay`: I will pay online at IRS.gov (Direct Pay) / 我自己在 IRS 网站上付
- `installment`: Pay a little each month (payment plan) / 分期付款
- `mail`: Mail a payment to the IRS / 邮寄付款给 IRS

---

## Section 8: Language and Election Fund

**Q8.1** Do you want letters from the IRS in a language other than English? / 您希望 IRS 用英语以外的语言给您写信吗？
`irs_language_pref` · Who (multi-select)

**Q8.2** Which language? / 什么语言？
`irs_language` · Dropdown / Text · **Show if** `irs_language_pref ≠ none`

**Q8.3** Do you want $3 to go to the Presidential Election Campaign Fund? / 您想让 3 美元进入总统选举竞选基金吗？
`pecf` · Who (multi-select)
> Tip: **This will NOT change your tax or your refund.** It only decides where $3 of government money goes. / 这不会改变您的税款或退税。

---

## Section 9: Money You Got in 2025 (Income)

**Intro text:**
> Check every kind of money that **you or your spouse** got in 2025. Bring the tax papers for each one.
> 请勾选 2025 年您或配偶收到的所有类型的钱，并带上相关税表。

> Each item below is Yes / No / Not sure. Some items have follow-up questions.

**Q9.1** Pay from a job (part-time or full-time) / 工作工资（兼职或全职）
`inc_wages`
> Tip: You usually get a **W-2** form from your employer.

**Q9.1a** How many jobs did you and your spouse have in 2025? / 2025 年您和配偶一共有几份工作？
`inc_wages_job_count` · Number · **Show if** `inc_wages = yes`

**Q9.2** Tips (extra money from customers) / 小费
`inc_tips`

**Q9.3** Money from a retirement account, pension, or annuity / 退休账户、养老金或年金的钱
`inc_retirement`
> Tip: Like a 401(k) or IRA. You usually get a **1099-R** form.

**Q9.4** Disability payments (from insurance or workers' compensation) / 残疾补助（保险或工伤赔偿）
`inc_disability`

**Q9.5** Social Security or Railroad Retirement money / 社会安全金或铁路退休金
`inc_social_security`
> Tip: You get an **SSA-1099** or **RRB-1099** form.

**Q9.6** Unemployment money / 失业救济金
`inc_unemployment`
> Tip: You get a **1099-G** form.

**Q9.7** A refund of state or local income tax / 州或地方所得税的退税
`inc_state_refund`
> Tip: Money your state gave back to you from last year's taxes.

**Q9.8** Interest or dividends (from a bank account, bonds, etc.) / 利息或股息（银行账户、债券等）
`inc_interest_div`
> Tip: You get a **1099-INT** or **1099-DIV** form.

**Q9.9** You sold stocks, bonds, or real estate (land or buildings) / 卖了股票、债券或房地产
`inc_sale_assets`
> Tip: You usually get a **1099-B** form. Please bring your broker statement too.

**Q9.9a** Did last year's tax return show a loss from selling these? / 去年的报税表有没有显示这类买卖亏损？
`inc_sale_assets_prior_loss` · Yes / No / Not sure · **Show if** `inc_sale_assets = yes`

**Q9.10** Alimony (money from a former spouse, NOT child support) / 赡养费（前配偶给的钱，不是子女抚养费）
`inc_alimony`

**Q9.11** You rented out your house or a room in your house / 出租您的房子或房间
`inc_rental_home`

**Q9.11a** Did you also live in that home, AND rent it out for less than 15 days in 2025? / 您自己也住在那里，并且 2025 年出租不到 15 天吗？
`inc_rental_home_under15` · Yes / No / Not sure · **Show if** `inc_rental_home = yes`

**Q9.12** You rented out your things (like a car) / 出租您的物品（比如汽车）
`inc_rental_property`

**Q9.13** Gambling or lottery winnings / 赌博或彩票奖金
`inc_gambling`
> Tip: You may get a **W-2G** form.

**Q9.14** Money from contract work or your own business (self-employed) / 合同工或自己做生意的收入
`inc_self_employed`
> Tip: For example: driving for an app, cleaning houses, selling things. You may get a **1099-NEC**, **1099-MISC**, or **1099-K** form.

**Q9.14a** Did last year's tax return show a loss from this work? / 去年的报税表有没有显示这项工作亏损？
`inc_self_employed_prior_loss` · Yes / No / Not sure · **Show if** `inc_self_employed = yes`

**Q9.15** Any other money? (Cash payments, jury duty, prizes, digital money, royalties, union strike pay, etc.) / 其他任何收入？（现金、陪审团酬劳、奖金、数字货币、版税、罢工补助等）
`inc_other`

**Q9.15a** Please tell us what kind of money / 请说明是什么收入
`inc_other_desc` · Text · **Show if** `inc_other = yes`

---

## Section 10: Money You Spent in 2025 (Expenses)

### Part A: Big Expenses (these may lower your tax)

> Each item is Yes / No / Not sure.

**Q10.1** Interest on a home loan (mortgage) / 房贷利息
`exp_mortgage_interest`
> Tip: You get a **1098** form from your bank.

**Q10.2** Taxes you paid: state, local, property (real estate), sales tax, etc. / 缴纳的税：州税、地方税、房产税、销售税等
`exp_taxes`

**Q10.3** Medical, dental, or medicine costs / 医疗、牙科或药费
`exp_medical`

**Q10.4** Gifts to church or charity / 捐给教会或慈善机构的钱或物品
`exp_charity`

### Part B: Other Expenses

**Q10.5** Interest on a student loan / 学生贷款利息
`exp_student_loan`
> Tip: You get a **1098-E** form.

**Q10.6** Child care or care for a family member so you could work / 为了能工作而付的托儿费或家人照护费
`exp_dependent_care`
> Tip: Bring the provider's name, address, and tax ID number.

**Q10.7** Money you put into a retirement account (IRA, 401(k), etc.) / 存入退休账户的钱
`exp_retirement_contrib`

**Q10.8** School supplies you bought as a teacher, teacher's aide, or other school worker / 作为老师、助教或其他教育工作者自费买的教学用品
`exp_educator`

**Q10.9** Alimony you paid (NOT child support) / 您付给前配偶的赡养费（不是子女抚养费）
`exp_alimony_paid`
> Tip: Please bring your former spouse's Social Security number.

---

## Section 11: Things That Happened in 2025

> Each item is Yes / No / Not sure.

**Q11.1** You or someone in your family took classes (college, trade school, job training, etc.) / 您或家人上过课（大学、职业学校、工作培训等）
`evt_education`
> Tip: Bring the **1098-T** form from the school, plus receipts.

**Q11.2** You sold a home / 卖了房子
`evt_sold_home`

**Q11.3** You had a Health Savings Account (HSA) / 有健康储蓄账户（HSA）
`evt_hsa`
> Tip: A special bank account used only for medical costs.

**Q11.4** You bought health insurance from the Marketplace (HealthCare.gov or your state's site) / 通过政府医保市场（Marketplace）买了医疗保险
`evt_marketplace`
> Tip: Bring the **1095-A** form.

**Q11.5** You bought and installed energy-saving items for your home (windows, furnace, insulation, etc.) / 购买并安装了节能家居设备（窗户、暖气炉、隔热材料等）
`evt_energy`

**Q11.6** Other (for example: bought a new car) / 其他（比如买了新车）
`evt_other`

**Q11.6a** Please tell us what happened / 请说明
`evt_other_desc` · Text · **Show if** `evt_other = yes`
> Tip: If you bought a car, please bring the VIN (the car's ID number).

**Q11.7** A lender forgave or canceled some of your debt (credit card, home loan, etc.) / 贷款方免除或取消了您的部分债务（信用卡、房贷等）
`evt_debt_canceled`
> Tip: You may get a **1099-C** or **1099-A** form.

**Q11.8** You lost property or money because of a disaster the government declared (flood, hurricane, fire, etc.) / 因政府宣布的灾害（洪水、飓风、火灾等）受到损失
`evt_disaster`

**Q11.9** In the past, did the IRS say no to a tax credit you asked for? (like Earned Income Credit, Child Tax Credit, or American Opportunity Credit) / 以前 IRS 是否拒绝过您申请的税收抵免？
`evt_credit_disallowed`

**Q11.10** Did you get any letter or bill from the IRS? / 您收到过 IRS 的信件或账单吗？
`evt_irs_letter`
> Tip: Please bring the letter with you.

**Q11.11** Did you pay tax early during the year (estimated tax), or put last year's refund toward 2025 taxes? / 您在年中提前缴过税（预估税），或把去年的退税用于 2025 年的税吗？
`evt_estimated_payments`

**Q11.12** Will you bring last year's tax return? / 您会带上去年的报税表吗？
`evt_brought_prior_return` · Yes / No

---

## Section 12: Optional Questions (for statistics only)

**Page text:**
> These questions are **optional**. Your answers are **not** part of your tax return and are **not** sent to the IRS with your return.
> 以下问题可以不回答。答案不属于您的报税表，也不会随报税表发送给 IRS。

**Q12.1** How well can you talk with someone in English? / 您用英语交谈的能力如何？
`opt_english_speak` · Single choice: Very well / Well / Not well / Not at all / Prefer not to answer

**Q12.2** How well can you read a newspaper in English? / 您读英文报纸的能力如何？
`opt_english_read` · Single choice: Very well / Well / Not well / Not at all / Prefer not to answer

**Q12.3** Does anyone in your home have a disability? / 您家里有人有残疾吗？
`opt_household_disability` · Yes / No / Prefer not to answer

**Q12.4** Are you or your spouse a U.S. military veteran? / 您或配偶是美国退伍军人吗？
`opt_veteran` · Yes / No / Prefer not to answer

**Q12.5** What is your race and/or ethnicity? (Choose all that apply) / 您的种族和/或族裔？（可多选）
`opt_race_tp` · Multi-select
- American Indian or Alaska Native / 美洲原住民或阿拉斯加原住民
- Asian / 亚裔
- Black or African American / 黑人或非裔美国人
- Hispanic or Latino / 西班牙裔或拉丁裔
- Middle Eastern or North African / 中东或北非裔
- Native Hawaiian or Pacific Islander / 夏威夷原住民或太平洋岛民
- White / 白人
- Prefer not to answer / 不愿回答 *(added for online form)*

> Dev note: Show the examples from the paper form (e.g., "Chinese, Filipino, Vietnamese…") as small gray text under each option.

**Q12.6** What is your spouse's race and/or ethnicity? (Choose all that apply) / 您配偶的种族和/或族裔？（可多选）
`opt_race_sp` · Multi-select (same options as Q12.5) · **Show if** `marital_status = married`

**Privacy notice:** Show the full "Privacy Act and Paperwork Reduction Act Notice" from page 4 of the paper form in a collapsible box, titled "How we use your information / 我们如何使用您的信息".

---

## Section 13: Anything Else?

**Q13.1** Is there anything else you want the volunteer to know? / 还有什么想告诉志愿者的吗？
`additional_notes` · Long text · Optional

---

## Section 14: Permission to Share Your Tax Information Next Year (Form 15080)

**Page text (plain-language summary):**
> **This page is optional. You will still get tax help if you say No.**
> 此页可选。即使您选择"不同意"，我们也会帮您报税。
>
> If you say **Yes**: next year you can go to **any** free tax help site that uses TaxSlayer software, and your information from this year will already be filled in. This saves time.
> 如果同意：明年您去任何使用 TaxSlayer 软件的免费报税点，今年的资料都会自动填好。
>
> Information that will be shared: your name, address, birthday, phone, Social Security number, filing status, job, employer, income, deductions, credits, and your dependents' names, SSNs, birthdays, and relationship to you.
>
> This permission lasts until **November 30, 2027**.
>
> **Important:** Once shared, federal law may not protect this information from further use.
> You do **not** need to say Yes for the site helping you this year. This only helps if you go to a **different** site next year.
> You have the right to get a signed copy of this form.

Show the full original Form 15080 text in a collapsible box: "Read the full legal text / 阅读完整法律条款".

**Q14.1** Do you agree to let your tax information be shared this way? / 您同意以这种方式共享您的报税信息吗？
`gcf_consent` · Single choice · Required
- `yes`: Yes, I agree / 同意
- `no`: No, I do not agree / 不同意

> Tip: If you want the permission to last a shorter time, or share less information, choose **No**.

**Q14.2** Type your full name to sign / 请输入您的全名作为签名
`gcf_tp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes`

**Q14.3** Date / 日期
`gcf_tp_date` · Date (auto-fill today) · **Show if** `gcf_consent = yes`

**Q14.4** Spouse: type your full name to sign / 配偶请输入全名签名
`gcf_sp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes` AND `marital_status = married`

**Q14.5** Spouse date / 配偶签名日期
`gcf_sp_date` · Date · **Show if** `gcf_sp_signature` is filled

**Footer text:**
> If you think your tax information was shared or used wrongly, call TIGTA: **1-800-366-4484**, or visit https://www.tigta.gov/reportcrime-misconduct

---

## Appendix A: Volunteer-Only Fields (NOT shown on public form)

These are on the right side of the paper form, "To be completed by certified volunteer". Put them in the **volunteer back office**, not the taxpayer form.

| Paper form area | Volunteer fields |
|---|---|
| Page 1 household table | Qualifying child/relative of any other person; person provided >50% of own support; person had <$5,200 income; taxpayer provided >50% of support; taxpayer paid >half the cost of maintaining a home |
| Page 2 income | Counts of W-2, 1099-R, SSA-1099, 1099-G, 1099-INT, 1099-DIV, 1099-B, W-2G, 1099-MISC/NEC/K; QCD amount; state refund amount; itemized last year; capital loss carryover; alimony amount & excluded; rental expense; Schedule C expenses; other income; notes |
| Page 3 deductions | 1098 count; standard vs. itemized; 1098-E; child care credit; IRA; educator expense amount; alimony paid with spouse SSN; adjustment to income; notes |
| Page 3 events | Taxable scholarship; 1098-T; education credit; 1099-S; HSA contributions/distributions; 1095-A; Form 5695 Part II; VIN; 1099-C; 1099-A; disaster relief; credit disallowed year & reason; LITC referral; estimated payments; prior-year refund applied; prior-year return available; notes |

## Appendix B: Field ID Mapping to Paper Form

| Section | Paper form location |
|---|---|
| 1–4 | Form 13614-C p.1, top (personal info, address, marital status) |
| 5 | p.1, "Check if you or your spouse were in 2025" + two-states + claimed by others |
| 6 | p.1, household member table (taxpayer-answered columns only) |
| 7–8 | p.1, refund/payment, language, Presidential Election Campaign Fund |
| 9 | p.2, left side (Income) |
| 10–11 | p.3, left side (Expenses and Tax Related Events) |
| 12 | p.4 (Optional Information) |
| 13 | p.5 (Additional Notes) |
| 14 | Form 15080 (Global Carry Forward consent) |
