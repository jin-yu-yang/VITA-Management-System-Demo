# Tax Help Intake Form: Question Design (for Online Form)

> Source: IRS Form 13614-C (Rev. 10-2025) + Form 15080 (Rev. 10-2025)
> Tax year: **2025**
> Every question includes: plain-English wording, Chinese wording, field ID, input type, and display conditions.

---

## Design Conventions (for developers)

- **Language level**: Short sentences, everyday words. When a technical term is unavoidable, explain it in parentheses or a Tip right after it.
- **One question per screen or per group**: Don't stack too much on one page.
- **Terms used in Chinese**: "IRS" is always written as "国税局（IRS）" the first time on each page, then "国税局". "Spouse" is always "您爱人".
- **"Who" multi-select questions**: Many questions ask "you or your spouse". The standard options are:
  - `me` (Me / 我自己)
  - `spouse` (My spouse / 我爱人), **shown only when married**
  - `none` (No one / 都没有), which clears the other two when selected
- **Every Yes/No question** has an extra option: `not_sure` (I'm not sure / 我不确定). The volunteer will confirm it in person.
- **Show if** = the question appears only when the condition is met.
- **Upload**: When a Tip says "upload", show a file-upload button right under that question.
- Fields on the paper form marked "To be completed by certified volunteer" **do not appear on the public-facing form** (see the appendix).

---

## Section 0: Before You Start / 开始之前

**Page text (no input required):**

> Please have these ready:
> - Tax papers you got in the mail, like **W-2** (from your job), **1099**, **1098**, **1095**
> - **Social Security card** or **ITIN letter** for everyone on your tax return
> - **Photo ID** (like a driver's license) for you and your spouse
>
> You are responsible for the information on your tax return. Please answer honestly and completely.
> If you don't understand a question, choose "I'm not sure." A volunteer will help you.
>
> 请提前准备好：
> - 寄到您家的税表，比如 W-2（工作单位给的）、1099、1098、1095
> - 报税表上每个人的社安卡（Social Security card）或 ITIN 信
> - 您和您爱人带照片的身份证件（比如驾照）
>
> 报税表上的信息由您负责，请如实、完整地回答。
> 看不懂的问题可以选"我不确定"，志愿者会帮您。

To report unethical behavior by a volunteer: ts.voltax@irs.gov / 如果志愿者有不当行为，请发邮件举报：ts.voltax@irs.gov

---

## Section 1: About You / 关于您

**Q1.1** What is your first name? / 您的名字（名）是什么？请只写"名"，不要写"姓"。
`tp_first_name` · Text · Required
> Tip: Write it the same way as on your Social Security card. / 拼写要和社安卡上的一模一样。

**Q1.2** What is your middle name? / 您的中间名是什么？
`tp_middle_name` · Text · Optional
> Tip: If you don't have a middle name, leave this empty. / 有就写，没有就空着。

**Q1.3** What is your last name? / 您的姓是什么？
`tp_last_name` · Text · Required
> Tip: Write it the same way as on your Social Security card. / 拼写要和社安卡上的一模一样。

**Q1.4** When were you born? / 您的出生日期是哪一天？
`tp_dob` · Date (MM/DD/YYYY) · Required
> Tip: Month / Day / Year. / 按 月/日/年 的顺序填写。

**Q1.5** What is your job? / 您做什么工作？
`tp_job_title` · Text · Required
> Tip: For example: cook, caregiver, delivery driver, student, retired, no job. / 比如：厨师、护工、外卖司机、学生、退休、没有工作。

**Q1.6** What is your phone number? / 您的电话号码是多少？
`tp_phone` · Phone · Required

**Q1.7** What is your email? (You can skip this.) / 您的电子邮箱是什么？（可以不填）
`email` · Email · Optional

---

## Section 2: Your Address / 您的地址

**Q2.1** What is your street address? / 您收信的地址是什么？（门牌号和街道名）
`addr_street` · Text · Required
> Tip: This is where you get your mail. Letters from the IRS will be sent here. / 请填您平时收信的地址，国税局（IRS）的信会寄到这里。

**Q2.2** Apartment number (if you have one) / 公寓号或房间号（没有就空着）
`addr_apt` · Text · Optional

**Q2.3** City / 您住在哪个城市？
`addr_city` · Text · Required

**Q2.4** State / 您住在哪个州？
`addr_state` · Dropdown (US states) · Required

**Q2.5** ZIP code / 您家的邮编是多少？（5 位数字）
`addr_zip` · Text (5 digits) · Required

---

## Section 3: Marriage / 婚姻状况

**Q3.1** On December 31, 2025, were you… / 在 2025 年 12 月 31 日，您的婚姻状况是？
`marital_status` · Single choice · Required
- `never_married`: Never married / 从来没结过婚
- `married`: Married / 已婚
- `divorced`: Divorced / 已离婚
- `separated`: Legally separated, but not divorced / 法院判了分居，但还没离婚
- `widowed`: My husband or wife died / 丧偶（爱人已去世）

> Tip: "Legally separated" means a court gave you a paper saying you are separated. Just living apart is not the same. / "法院判了分居"是指法院给了您一份正式的分居文件。只是平时不住在一起，不算。

**Q3.2** Were you still married on the last day of 2025 (December 31)? / 在 2025 年最后一天（12 月 31 日），您和您爱人还是夫妻吗？
`married_last_day` · Yes / No · **Show if** `marital_status = married`

**Q3.3** From July 1 to December 31, 2025, did you and your spouse live in different homes the whole time? / 2025 年 7 月 1 日到 12 月 31 日，您和您爱人是不是一直分开住？
`lived_apart_last_6mo` · Yes / No · **Show if** `marital_status = married`

**Q3.4** What date was your divorce made final? / 法院正式判您离婚是哪一天？
`divorce_date` · Date · **Show if** `marital_status = divorced`
> Tip: This date is on your divorce papers from the court. / 请看法院离婚文件上的日期。

**Q3.5** What date did the court make your separation official? / 法院正式判您分居是哪一天？
`separation_date` · Date · **Show if** `marital_status = separated`
> Tip: This date is on your court papers. / 请看法院分居文件上的日期。

**Q3.6** What year did your spouse die? / 您爱人是哪一年去世的？
`spouse_death_year` · Year · **Show if** `marital_status = widowed`

---

## Section 4: About Your Spouse / 关于您爱人

> **Show this whole section if** `marital_status = married`

**Q4.1** Your spouse's first name / 您爱人的名字（名）是什么？请只写"名"，不要写"姓"。
`sp_first_name` · Text · Required
> Tip: Write it the same way as on their Social Security card. / 拼写要和社安卡上的一模一样。

**Q4.2** Your spouse's middle name / 您爱人的中间名是什么？
`sp_middle_name` · Text · Optional
> Tip: If your spouse doesn't have a middle name, leave this empty. / 有就写，没有就空着。

**Q4.3** Your spouse's last name / 您爱人姓什么？
`sp_last_name` · Text · Required

**Q4.4** Your spouse's date of birth / 您爱人的出生日期是哪一天？
`sp_dob` · Date (MM/DD/YYYY) · Required

**Q4.5** Your spouse's job / 您爱人做什么工作？
`sp_job_title` · Text · Required
> Tip: For example: cook, caregiver, delivery driver, student, retired, no job. / 比如：厨师、护工、外卖司机、学生、退休、没有工作。

**Q4.6** Your spouse's phone number / 您爱人的电话号码是多少？
`sp_phone` · Phone · Optional

---

## Section 5: Your Situation in 2025 / 您 2025 年的情况

> Use the "Who" multi-select (Me / My spouse / No one) for Q5.3–Q5.9.

**Q5.1** In 2025, did you live or work in 2 or more states? / 2025 年，您有没有在两个或更多的州住过或工作过？
`multi_state` · Yes / No / Not sure
> Tip: For example, you live in Pennsylvania but work in New Jersey. / 比如：您住在宾州，但在新泽西州上班。

**Q5.2** Can someone else (like a parent or grown child) list you or your spouse as a dependent on their tax return? / 有没有别人（比如您的父母或成年子女）报税时，会把您或您爱人写进他们的税表里，算作由他们养活的人？
`claimed_by_other` · Yes / No / Not sure
> Tip: This often happens with students whose parents still support them. / 常见情况：父母还在供养的学生。

**Q5.3** Who is a U.S. citizen? / 您和您爱人，谁是美国公民？
`us_citizen` · Who (multi-select)

**Q5.4** Who was in the U.S. on a visa in 2025? / 2025 年，您和您爱人，谁是拿签证待在美国的？
`on_visa` · Who (multi-select)
> Tip: For example, a student visa or work visa. A green card is **NOT** a visa. / 比如学生签证、工作签证。**有绿卡不算签证，请不要选。**

**Q5.5** Who was a full-time student in 2025? / 2025 年，您和您爱人，谁至少有 5 个月是学校认定的全日制学生？
`fulltime_student` · Who (multi-select)

**Q5.6** Who is legally blind? / 您和您爱人，谁有医生证明是法定失明？
`legally_blind` · Who (multi-select)
> Tip: A doctor said you cannot see well even with glasses. / 意思是：医生证明戴眼镜也看不清楚。

**Q5.7** Who is totally and permanently disabled? / 您和您爱人，谁是完全并且永久残疾？
`disabled` · Who (multi-select)
> Tip: A doctor said you cannot work because of a health problem that will last at least 1 year or forever. / 意思是：医生证明因为身体问题不能工作，而且至少会持续一年或一辈子。

**Q5.8** Who got an Identity Protection PIN (IP PIN) from the IRS? / 您和您爱人，谁收到过国税局（IRS）寄来的 6 位数字号码，叫"身份保护码"（IP PIN）？
`ippin` · Who (multi-select)
> Tip: The IRS sends a new one each year, often after identity theft. You may also have signed up for it yourself. If you have one, please upload this year's letter. / 这个号码通常是身份被盗用后国税局寄来的，也可能是您自己申请的，**每年都会换一个新的**。如果有，请上传今年收到的那封信。

**Q5.9** Who owned or held any digital money (like Bitcoin or other crypto) in 2025? / 2025 年，您和您爱人，谁拥有过数字货币（比如比特币、以太坊、狗狗币）？
`digital_assets` · Who (multi-select)

---

## Section 6: People Who Live With You or That You Support / 和您同住的人，或您出钱养的人

**Intro text:**
> Tell us about **everyone who lived with you in 2025** (not your spouse).
> Also tell us about **anyone you gave money to for living costs**, even if they did not live with you.
> For example: your children, your parents, other family members.
>
> 请告诉我们 2025 年和您住在一起的所有人（您爱人除外），以及虽然不住在一起、但您出钱养的人。
> 比如：您的孩子、父母、其他家人。

**Q6.0** Did anyone live with you or depend on you for money in 2025? / 2025 年，有没有人和您住在一起，或者靠您出钱生活？
`has_household_members` · Yes / No

> **Show if** `has_household_members = yes`: Repeatable group "Add a person / 添加一个人" (the paper form has 4 rows; the online form can allow more).

For each person:

**Q6.1** First name / 这个人的名字（名）
`hh[i].first_name` · Text · Required

**Q6.1b** Last name / 这个人的姓
`hh[i].last_name` · Text · Required
> Dev note: Split into two boxes so people don't mix up first and last name. / 例：张三 → 名填 San，姓填 Zhang。

**Q6.2** Date of birth / 这个人的出生日期
`hh[i].dob` · Date (MM/DD/YYYY) · Required

**Q6.3** How is this person related to you? / 这个人和您是什么关系？
`hh[i].relationship` · Dropdown · Required
- Son / Daughter (儿子/女儿), Stepchild (继子女), Foster child (寄养的孩子), Grandchild (孙子女/外孙子女), Brother / Sister (兄弟姐妹), Niece / Nephew (侄子女/外甥子女), Parent (父母), Grandparent (祖父母/外祖父母), Other relative (其他亲戚), Not related (不是亲戚)

**Q6.4** How many months did this person live in your home in 2025? / 2025 年，这个人在您家住了几个月？
`hh[i].months_lived` · Number 0–12 · Required
> Tip: If they were born in 2025 and lived with you since birth, choose 12. / 如果是 2025 年出生、一出生就和您住在一起，请选 12。

**Q6.5** Was this person married on December 31, 2025? / 在 2025 年 12 月 31 日，这个人结婚了吗？
`hh[i].married` · Yes (Married / 已婚) / No (Single / 未婚)

**Q6.6** Is this person a U.S. citizen? / 这个人是美国公民吗？
`hh[i].us_citizen` · Yes / No / Not sure

**Q6.7** In 2025, did this person live in the U.S., Canada, or Mexico? / 2025 年，这个人是住在美国、加拿大或墨西哥吗？
`hh[i].resident_na` · Yes / No / Not sure

**Q6.8** Was this person a full-time student in 2025? / 2025 年，这个人有没有至少 5 个月是学校认定的全日制学生？
`hh[i].fulltime_student` · Yes / No / Not sure

**Q6.9** Is this person totally and permanently disabled? / 这个人是完全并且永久残疾吗？
`hh[i].disabled` · Yes / No / Not sure

**Q6.10** Did this person get an IP PIN from the IRS? / 这个人有没有收到过国税局寄来的 6 位数字"身份保护码"（IP PIN）？
`hh[i].ippin` · Yes / No / Not sure
> Tip: If yes, please upload this year's letter. / 如果有，请上传今年收到的那封信。

---

## Section 7: Your Refund or Payment / 退税或补税

**Q7.1** If you get money back (a refund), how do you want to get it? / 如果报完税，国税局要退钱给您，您想怎么收到这笔钱？
`refund_method` · Single choice
- `direct_deposit`: Put it straight into my bank account / 直接存进我的银行账户（最快）
- `check`: Mail me a paper check / 寄一张支票给我
- `split`: Split it into more than one bank account / 分开存进几个银行账户
- `other`: Other / 其他方法

> Tip (show if `direct_deposit` or `split`): Please have your bank routing number and account number ready. A blank check works. / 请准备好银行的路由号码和账户号码，一张空白支票上就有。

**Q7.1a** Please tell us more / 请告诉我们您想用什么方法收钱
`refund_method_other` · Text · **Show if** `refund_method = other`

**Q7.2** If you owe money, how do you want to pay? / 如果报完税发现您还要补交钱，您想怎么付？
`payment_method` · Single choice
- `bank_account`: Take it from my bank account / 直接从我的银行账户扣
- `direct_pay`: I will pay online at IRS.gov (Direct Pay) / 我自己上国税局网站（IRS.gov）付
- `installment`: Pay a little each month (payment plan) / 每个月付一点，分期付完
- `mail`: Mail a payment to the IRS / 寄支票给国税局

---

## Section 8: Language and Election Fund / 语言和总统选举基金

**Q8.1** Do you want letters from the IRS in a language other than English? / 您希望国税局（IRS）用英语以外的语言给您写信吗？
`irs_language_pref` · Who (multi-select)

**Q8.2** Which language? / 什么语言？
`irs_language` · Dropdown / Text · **Show if** `irs_language_pref ≠ none`

**Q8.3** Do you want $3 to go to the Presidential Election Campaign Fund? / 您愿意让国税局把 3 美元拨给总统选举基金吗？
`pecf` · Who (multi-select)
> Tip: **This will NOT change your tax or your refund.** It only decides where $3 of government money goes. / **您不用多付钱，您的税和退税也不会变。**这只是决定政府的 3 美元用在哪里。

---

## Section 9: Money You Got in 2025 (Income) / 您 2025 年收到的钱（收入）

**Intro text:**
> For each item below: did **you or your spouse** get this kind of money in 2025? If yes, please upload the tax papers for it.
> 下面每一题都在问：2025 年，您或您爱人有没有收到过这种钱？如果有，请上传相关的税表。

> Each item below is Yes / No / Not sure. Some items have follow-up questions.

**Q9.1** Pay from a job (part-time or full-time) / 上班的工资（兼职或全职）
`inc_wages`
> Tip: You usually get a **W-2** form from your employer. / 一般会从工作单位收到 **W-2** 表。

**Q9.1a** How many jobs did you and your spouse have in 2025? / 2025 年，您和您爱人一共做了几份工作？
`inc_wages_job_count` · Number · **Show if** `inc_wages = yes`
> Tip: Usually one W-2 for each job. / 一般一份工作一张 W-2，有几张 W-2 就填几。

**Q9.2** Tips (extra money from customers) / 小费（客人额外给的钱）
`inc_tips`
> Tip: All tips count as income, including cash tips. Some tips may lower your tax starting in 2025. Please bring your tip records, and the volunteer will check. / 所有小费都要报，包括现金小费。从 2025 年起，部分小费可能可以减税。请准备好您记录的小费金额，志愿者会帮您判断。

**Q9.3** Money from a retirement account, pension, or annuity / 从退休账户、养老金或年金拿到的钱
`inc_retirement`
> Tip: Like a 401(k) or IRA. You usually get a **1099-R** form. / 比如 401(k) 或 IRA。一般会收到 **1099-R** 表。

**Q9.4** Disability payments (from insurance or workers' compensation) / 残障补助（保险公司给的，或工伤赔偿）
`inc_disability`

**Q9.5** Social Security or Railroad Retirement money / 社安金（Social Security）或铁路退休金
`inc_social_security`
> Tip: You get an **SSA-1099** or **RRB-1099** form. / 会收到 **SSA-1099** 或 **RRB-1099** 表。

**Q9.6** Unemployment money / 失业金
`inc_unemployment`
> Tip: You get a **1099-G** form. / 会收到 **1099-G** 表。

**Q9.7** A refund of state or local income tax / 州税或市税的退税
`inc_state_refund`
> Tip: Money your state or city gave back to you from last year's taxes. / 就是州政府或市政府退给您的去年的税。

**Q9.8** Interest or dividends (from a bank account, bonds, stocks, etc.) / 银行利息或股票分红（银行账户、债券、股票等）
`inc_interest_div`
> Tip: You get a **1099-INT** or **1099-DIV** form. / 会收到 **1099-INT** 或 **1099-DIV** 表。

**Q9.9** You sold stocks, bonds, or real estate (land or buildings) / 卖了股票、债券或房地产（房子、土地）
`inc_sale_assets`
> Tip: You usually get a **1099-B** form. Please upload your broker statement too. / 一般会收到 **1099-B** 表。请把证券公司的对账单也一起上传。

**Q9.9a** Did last year's tax return show a loss from selling these? / 去年的报税表上，有没有这类买卖亏钱的记录？
`inc_sale_assets_prior_loss` · Yes / No / Not sure · **Show if** `inc_sale_assets = yes`

**Q9.10** Alimony (money from a former spouse, NOT child support) / 赡养费（前夫或前妻给您的钱，**不包括**孩子的抚养费）
`inc_alimony`

**Q9.11** You rented out your house or a room in your house / 把您的房子或房间租给别人
`inc_rental_home`

**Q9.11a** Did you also live in that home, AND rent it out for less than 15 days in 2025? / 这个房子您自己也住，而且 2025 年一共租出去不到 15 天吗？
`inc_rental_home_under15` · Yes / No / Not sure · **Show if** `inc_rental_home = yes`

**Q9.12** You rented out your things (like a car) / 把您的东西租给别人（比如汽车、工具）
`inc_rental_property`

**Q9.13** Gambling or lottery winnings / 赌博赢的钱或彩票中奖
`inc_gambling`
> Tip: You may get a **W-2G** form. / 可能会收到 **W-2G** 表。

**Q9.14** Money from contract work or your own business (self-employed) / 打零工、合同工或自己做生意的收入
`inc_self_employed`
> Tip: For example: delivery or rideshare apps, cleaning houses, selling things. You may get a **1099-NEC**, **1099-MISC**, or **1099-K** form. / 比如：送外卖、开 Uber/Lyft、帮人打扫、卖东西。可能会收到 **1099-NEC**、**1099-MISC** 或 **1099-K** 表。

**Q9.14a** Did last year's tax return show a loss from this work? / 去年的报税表上，这份工作有没有亏钱的记录？
`inc_self_employed_prior_loss` · Yes / No / Not sure · **Show if** `inc_self_employed = yes`

**Q9.15** Any other money? (Cash payments, jury duty, prizes, digital money, royalties, union strike pay, etc.) / 还有其他收入吗？（比如：现金收入、做陪审员的钱、中奖或比赛奖金、数字货币、版税、工会罢工补助）
`inc_other`

**Q9.15a** Please tell us what kind of money / 请说明是什么收入
`inc_other_desc` · Text · **Show if** `inc_other = yes`

---

## Section 10: Money You Spent in 2025 (Expenses) / 您 2025 年花的钱（开销）

### Part A: Big Expenses (these may lower your tax) / 第一部分：大笔开销（可能可以减税）

> Each item is Yes / No / Not sure.

**Q10.1** Interest on a home loan (mortgage) / 房贷利息
`exp_mortgage_interest`
> Tip: You get a **1098** form from your bank. / 银行会寄 **1098** 表给您。

**Q10.2** Taxes you paid: state, local, property (real estate), sales tax, etc. / 您交过的税：州税、地方税、房产税、消费税等
`exp_taxes`

**Q10.3** Medical, dental, or medicine costs / 看病、看牙或买药的钱
`exp_medical`

**Q10.4** Gifts to church or charity / 捐给教会或慈善机构的钱或东西
`exp_charity`

### Part B: Other Expenses / 第二部分：其他开销

**Q10.5** Interest on a student loan / 学生贷款的利息
`exp_student_loan`
> Tip: You get a **1098-E** form. / 会收到 **1098-E** 表。

**Q10.6** Child care or care for a family member so you could work / 为了去上班，付钱请人照顾孩子或家人
`exp_dependent_care`
> Tip: Please have the care provider's name, address, and tax ID number. / 请准备好托儿所或照顾者的名字、地址和税号。

**Q10.7** Money you put into a retirement account (IRA, 401(k), etc.) / 存进退休账户的钱（IRA、401(k) 等）
`exp_retirement_contrib`

**Q10.8** School supplies you bought as a teacher, teacher's aide, or other school worker / 您是老师、助教或其他学校员工，自己掏钱买的教学用品
`exp_educator`

**Q10.9** Alimony you paid (NOT child support) / 您付给前夫或前妻的赡养费（**不包括**孩子的抚养费）
`exp_alimony_paid`
> Tip: Please have your former spouse's Social Security number. / 请准备好前夫或前妻的社安号码。

---

## Section 11: Things That Happened in 2025 / 2025 年发生的事

> Each item is Yes / No / Not sure.

**Q11.1** You or someone in your family took classes (college, trade school, job training, etc.) / 您或家人上过课（大学、职业学校、工作培训等）
`evt_education`
> Tip: Upload the **1098-T** form from the school, plus payment receipts. / 请上传学校的 **1098-T** 表和交学费的收据。

**Q11.2** You sold a home / 您卖了房子
`evt_sold_home`

**Q11.3** You had a Health Savings Account (HSA) / 您有健康储蓄账户（HSA）
`evt_hsa`
> Tip: A special bank account used only for medical costs. / 这是一种专门用来付医疗费的账户。

**Q11.4** You bought health insurance from the Marketplace (HealthCare.gov or your state's site) / 2025 年，您有没有在政府医保网站上买医疗保险（HealthCare.gov 或州政府的网站，俗称"奥巴马保险"）？
`evt_marketplace`
> Tip: Upload every **1095-A** form you got. Medicaid and Medicare do NOT count. / 请上传收到的所有 **1095-A** 表。白卡（Medicaid）和红蓝卡（Medicare）不算。

**Q11.5** You bought and installed energy-saving items for your home (windows, furnace, insulation, etc.) / 您买了并安装了节能的家居设备（窗户、暖气炉、隔热材料等）
`evt_energy`

**Q11.6** Other (for example: bought a new car) / 其他事情（比如买了新车）
`evt_other`

**Q11.6a** Please tell us what happened / 请说明发生了什么
`evt_other_desc` · Text · **Show if** `evt_other = yes`
> Tip: If you bought a new car with a loan, please give us the VIN (the car's 17-digit ID number). / 如果您是贷款买的新车，请提供车辆识别号码（VIN，17 位），在购车合同或车辆登记卡上可以找到。

**Q11.7** A lender forgave or canceled some of your debt (credit card, home loan, etc.) / 银行或贷款公司有没有免掉您欠的一部分或全部钱，您不用再还了？（比如信用卡欠款和解、房子被银行收回）
`evt_debt_canceled`
> Tip: You may get a **1099-C** or **1099-A** form. / 可能会收到 **1099-C** 或 **1099-A** 表。

**Q11.8** You lost property or money because of a disaster the government declared (flood, hurricane, fire, etc.) / 因为政府宣布的灾害（洪水、飓风、火灾等）损失了财产或钱
`evt_disaster`

**Q11.9** In the past, did the IRS say no to a tax credit you asked for? (like Earned Income Credit, Child Tax Credit, or American Opportunity Credit) / 以前国税局有没有拒绝过您申请的税务补助？（比如低收入补助 EITC、儿童税务补助 CTC、大学学费补助 AOTC）
`evt_credit_disallowed`

**Q11.10** Did you get any letter or bill from the IRS? / 您有没有收到过国税局的信或账单？
`evt_irs_letter`
> Tip: Please upload the letter. / 如果有，请上传。

**Q11.11** Did you pay tax early during the year (estimated tax), or put last year's refund toward 2025 taxes? / 2025 年，您有没有提前预交过税，或者把去年的退税留着抵 2025 年的税？
`evt_estimated_payments`

**Q11.12** Can you upload last year's tax return? / 您能上传去年的报税表吗？
`evt_brought_prior_return` · Yes / No

---

## Section 12: Optional Questions (for statistics only) / 选填问题（仅用于统计）

**Page text:**
> These questions are **optional**. Your answers are **not** part of your tax return and are **not** sent to the IRS with your return.
> 以下问题**可以不回答**。您的回答**不属于**报税表，也**不会**和报税表一起寄给国税局。

**Q12.1** How well can you talk with someone in English? / 您用英语和别人聊天的水平怎么样？
`opt_english_speak` · Single choice: Very well (很好) / Well (还可以) / Not well (不太好) / Not at all (完全不会) / Prefer not to answer (不想回答)

**Q12.2** How well can you read a newspaper in English? / 您看英文报纸的水平怎么样？
`opt_english_read` · Single choice: Very well (很好) / Well (还可以) / Not well (不太好) / Not at all (完全不会) / Prefer not to answer (不想回答)

**Q12.3** Does anyone in your home have a disability? / 您家里有没有人有残疾？
`opt_household_disability` · Yes (有) / No (没有) / Prefer not to answer (不想回答)

**Q12.4** Are you or your spouse a U.S. military veteran? / 您或您爱人是美国退伍军人吗？
`opt_veteran` · Yes (是) / No (不是) / Prefer not to answer (不想回答)

**Q12.5** What is your race and/or ethnicity? (Choose all that apply) / 您的种族或族裔是什么？（可以多选）
`opt_race_tp` · Multi-select
- American Indian or Alaska Native / 美洲原住民或阿拉斯加原住民
- Asian / 亚裔
- Black or African American / 黑人或非裔美国人
- Hispanic or Latino / 西班牙裔或拉丁裔
- Middle Eastern or North African / 中东或北非裔
- Native Hawaiian or Pacific Islander / 夏威夷原住民或太平洋岛民
- White / 白人
- Prefer not to answer / 不想回答 *(added for online form)*

> Dev note: Show the examples from the paper form (e.g., "Chinese, Filipino, Vietnamese…") as small gray text under each option.

**Q12.6** What is your spouse's race and/or ethnicity? (Choose all that apply) / 您爱人的种族或族裔是什么？（可以多选）
`opt_race_sp` · Multi-select (same options as Q12.5) · **Show if** `marital_status = married`

**Privacy notice:** Show the full "Privacy Act and Paperwork Reduction Act Notice" from page 4 of the paper form in a collapsible box, titled "How we use your information / 我们如何使用您的信息".

---

## Section 13: Anything Else? / 其他

**Q13.1** Is there anything else you want the volunteer to know? / 还有什么想告诉志愿者的吗？
`additional_notes` · Long text · Optional

---

## Section 14: Permission to Share Your Tax Information Next Year (Form 15080) / 同意明年共享您的报税资料

**Page text (plain-language summary):**
> **This page is optional. You will still get tax help if you say No.**
> **此页可选。即使您选"不同意"，我们也照样帮您报税。**
>
> If you say **Yes**: next year you can go to **any** free tax help site that uses TaxSlayer software, and your information from this year will already be filled in. This saves time.
> 如果您同意：明年您去**任何一个**使用 TaxSlayer 软件的免费报税点，今年的资料都会自动填好，可以节省时间。
>
> Information that will be shared: your name, address, birthday, phone, Social Security number, filing status, job, employer, income, deductions, credits, and your dependents' names, SSNs, birthdays, and relationship to you.
> 会共享的资料：您的姓名、地址、生日、电话、社安号码、报税身份、工作、工作单位、收入、减税和补助项目，以及您家属的姓名、社安号码、生日和与您的关系。
>
> This permission lasts until **November 30, 2027**.
> 这个同意有效期到 **2027 年 11 月 30 日**。
>
> **Important:** Once shared, federal law may not protect this information from further use.
> **注意：**资料共享出去以后，联邦法律可能无法保护它不被再次使用。
>
> You do **not** need to say Yes for the site helping you this year. This only helps if you go to a **different** site next year.
> 今年帮您报税的地方，**不需要**您同意这一页。只有明年您去**别的**报税点时，这一页才有用。
>
> You have the right to get a signed copy of this form.
> 您有权拿到一份签过名的表格副本。

Show the full original Form 15080 text in a collapsible box: "Read the full legal text / 阅读完整法律条款".

**Q14.1** Do you agree to let your tax information be shared this way? / 您同意用这种方式共享您的报税资料吗？
`gcf_consent` · Single choice · Required
- `yes`: Yes, I agree / 同意
- `no`: No, I do not agree / 不同意

> Tip: If you want the permission to last a shorter time, or share less information, choose **No**. / 如果您想让有效期更短，或者只共享一部分资料，请选**不同意**。

**Q14.2** Type your full name to sign / 请输入您的全名作为签名
`gcf_tp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes`

**Q14.3** Date / 日期
`gcf_tp_date` · Date (auto-fill today) · **Show if** `gcf_consent = yes`

**Q14.4** Spouse: type your full name to sign / 请您爱人输入全名作为签名
`gcf_sp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes` AND `marital_status = married`

**Q14.5** Spouse date / 您爱人签名的日期
`gcf_sp_date` · Date (auto-fill today) · **Show if** `gcf_sp_signature` is filled

**Footer text:**
> If you think your tax information was shared or used wrongly, call TIGTA: **1-800-366-4484**, or visit https://www.tigta.gov/reportcrime-misconduct
> 如果您认为您的报税资料被错误共享或使用，请打电话给 TIGTA：**1-800-366-4484**，或访问上面的网址。

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
